const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');

/**
 * Build an ImapFlow client from a saved account record.
 * Always creates a NEW, fresh client — never shares connections to avoid
 * race conditions with the IDLE worker.
 */
function createImapClient(account) {
  return new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: account.imap_secure === 1 || account.imap_secure === true,
    auth: {
      user: account.email,
      pass: account.password,
    },
    logger: false,
    tls: { rejectUnauthorized: false },
  });
}

/**
 * Get the exact unread (unseen) count directly from the IMAP server via STATUS.
 * STATUS is valid on a fresh connection where the mailbox is not selected.
 */
async function fetchUnreadCount(account, mailbox = 'INBOX') {
  const client = createImapClient(account);
  try {
    await client.connect();
    const status = await client.status(mailbox, { unseen: true });
    return typeof status.unseen === 'number' ? status.unseen : 0;
  } catch (e) {
    return 0;
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Test connectivity to an IMAP server without storing anything.
 */
async function testImapConnection(account) {
  const client = createImapClient(account);
  try {
    await client.connect();
    return true;
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Fast bulk sync — fetches ONLY headers (no body/attachments) for a specific range.
 *
 * @param {Object} account
 * @param {string} mailbox
 * @param {number} limit
 * @param {number|null} highestUidToFetch  null → fetch newest `limit` emails;
 *                                         N → fetch older emails with UID < N
 * @param {Function} onBatch
 */
async function syncMailboxHeaders(account, mailbox, limit = 100, highestUidToFetch = null, onBatch) {
  const client = createImapClient(account);
  try {
    await client.connect();
    const mailboxInfo = await client.mailboxOpen(mailbox);
    const total = mailboxInfo.exists;
    if (total === 0) return { total, fetched: 0 };

    let fetchCriteria;
    let fetchOptions = {};

    if (highestUidToFetch != null && highestUidToFetch > 1) {
      // Paginate older emails: search for UIDs strictly less than highestUidToFetch
      const maxUid = highestUidToFetch - 1;
      const searchResult = await client.search({ uid: `1:${maxUid}` }, { uid: true });
      if (!searchResult || searchResult.length === 0) return { total, fetched: 0 };

      // Take the last `limit` UIDs (newest among the older ones)
      const uidsToFetch = searchResult.slice(-limit);
      fetchCriteria = uidsToFetch;
      fetchOptions = { uid: true };
    } else {
      // Initial fetch: newest `limit` emails by sequence number
      const end = total;
      const start = Math.max(1, total - limit + 1);
      if (start > end) return { total, fetched: 0 };
      fetchCriteria = `${start}:${end}`;
    }

    const results = [];

    for await (const msg of client.fetch(fetchCriteria, { uid: true, flags: true, envelope: true, size: true }, fetchOptions)) {
      results.push({
        uid: msg.uid,
        message_id: msg.envelope?.messageId || null,
        subject: msg.envelope?.subject || '(no subject)',
        from_name: msg.envelope?.from?.[0]?.name || '',
        from_email: msg.envelope?.from?.[0]?.address || '',
        to_addresses: JSON.stringify(msg.envelope?.to?.map((a) => a.address) || []),
        cc_addresses: JSON.stringify(msg.envelope?.cc?.map((a) => a.address) || []),
        date: msg.envelope?.date ? msg.envelope.date.toISOString() : new Date().toISOString(),
        body_text: null,
        body_html: null,
        flags: JSON.stringify([...msg.flags]),
        attachments: null,
        is_read: msg.flags.has('\\Seen') ? 1 : 0,
        is_starred: msg.flags.has('\\Flagged') ? 1 : 0,
        size: msg.size || 0,
      });
    }

    if (results.length > 0) {
      if (onBatch) await onBatch(results.reverse(), total);
    }
    return { total, fetched: results.length };
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * On-demand full fetch — gets the full body and attachments for a single email.
 * Collects the message fully before returning to ensure the async iterator
 * is properly closed regardless of errors.
 */
async function fetchEmailBody(account, mailbox, uid) {
  const client = createImapClient(account);
  try {
    await client.connect();
    await client.mailboxOpen(mailbox);

    let result = null;
    for await (const msg of client.fetch({ uid }, { uid: true, source: true })) {
      const parsed = await simpleParser(msg.source);
      result = {
        body_text: parsed.text || null,
        body_html: parsed.html || null,
        attachments: JSON.stringify(
          (parsed.attachments || []).map((a) => ({
            filename: a.filename,
            contentType: a.contentType,
            size: a.size,
          }))
        ),
      };
      break; // only need the first message
    }
    return result;
  } catch (err) {
    console.error(`Failed to fetch body for uid=${uid}:`, err.message);
    return null;
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Used by background sync worker to get the single latest message.
 * Always returns null (never undefined) on error.
 */
async function fetchLatestEmailFull(account, mailbox) {
  const client = createImapClient(account);
  try {
    await client.connect();
    const info = await client.mailboxOpen(mailbox);
    if (info.exists === 0) return null;

    let result = null;
    for await (const msg of client.fetch(`${info.exists}:${info.exists}`, { uid: true, source: true, flags: true })) {
      const parsed = await simpleParser(msg.source);
      result = {
        uid: msg.uid,
        subject: parsed.subject || '(no subject)',
        from_name: parsed.from?.value?.[0]?.name || '',
        from_email: parsed.from?.value?.[0]?.address || '',
        date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
        body_text: parsed.text || null,
        body_html: parsed.html || null,
        flags: JSON.stringify([...msg.flags]),
        is_read: msg.flags.has('\\Seen') ? 1 : 0,
      };
      break;
    }
    return result;
  } catch (e) {
    console.error('[mailService] fetchLatestEmailFull error:', e.message);
    return null;
  } finally {
    await client.logout().catch(() => {});
  }
}



/**
 * Fetch available mailbox folders for an account.
 */
async function fetchMailboxes(account) {
  const client = createImapClient(account);
  try {
    await client.connect();
    const list = await client.list();
    return list.map((m) => ({
      path: m.path,
      name: m.name,
      delimiter: m.delimiter,
      flags: [...m.flags],
    }));
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Mark messages as read/unread on the IMAP server.
 */
async function setMessageFlags(account, mailbox, uid, flagsToAdd = [], flagsToRemove = []) {
  const client = createImapClient(account);
  try {
    await client.connect();
    await client.mailboxOpen(mailbox, { readOnly: false });
    if (flagsToAdd.length > 0) {
      await client.messageFlagsAdd({ uid }, flagsToAdd, { uid: true });
    }
    if (flagsToRemove.length > 0) {
      await client.messageFlagsRemove({ uid }, flagsToRemove, { uid: true });
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Permanently delete a message from the server.
 */
async function deleteMessage(account, mailbox, uid) {
  const client = createImapClient(account);
  try {
    await client.connect();
    await client.mailboxOpen(mailbox, { readOnly: false });
    await client.messageDelete({ uid }, { uid: true });
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Move a message to another mailbox (e.g. Trash).
 */
async function moveMessage(account, sourceMailbox, destMailbox, uid) {
  const client = createImapClient(account);
  try {
    await client.connect();
    await client.mailboxOpen(sourceMailbox, { readOnly: false });
    await client.messageMove({ uid }, destMailbox, { uid: true });
  } finally {
    await client.logout().catch(() => {});
  }
}



/**
 * Send an email via SMTP.
 * @param {Object} account - The sender account.
 * @param {Object} mailOptions - { to, cc, bcc, subject, text, html, attachments, readReceipt }
 */
async function sendEmail(account, mailOptions) {
  const transporter = nodemailer.createTransport({
    host: account.smtp_host,
    port: account.smtp_port,
    secure: account.smtp_secure === 1 || account.smtp_secure === true,
    auth: {
      user: account.email,
      pass: account.password,
    },
    tls: { rejectUnauthorized: false },
  });

  const message = {
    from: `"${account.name}" <${account.email}>`,
    to: mailOptions.to,
    cc: mailOptions.cc,
    bcc: mailOptions.bcc,
    subject: mailOptions.subject,
    text: mailOptions.text,
    html: mailOptions.html,
    attachments: mailOptions.attachments || [],
  };

  // Read receipt request (RFC 3798)
  if (mailOptions.readReceipt) {
    message.headers = {
      'Disposition-Notification-To': account.email,
      'Return-Receipt-To': account.email,
    };
  }

  const info = await transporter.sendMail(message);
  return { messageId: info.messageId, accepted: info.accepted };
}

/**
 * Auto-discover IMAP/SMTP settings for a domain (Thunderbird autodiscovery).
 */
async function autoDiscover(email) {
  const domain = email.split('@')[1];
  if (!domain) throw new Error('Invalid email address');

  const http = require('http');
  const https = require('https');

  const fetchXml = (url) =>
    new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? https : http;
      const req = mod.get(url, { timeout: 5000 }, (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume(); // drain to free socket
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(); // prevent socket leak
        reject(new Error('Timeout'));
      });
    });

  const urls = [
    `https://autoconfig.${domain}/mail/config-v1.1.xml?emailaddress=${email}`,
    `https://${domain}/.well-known/autoconfig/mail/config-v1.1.xml`,
  ];

  for (const url of urls) {
    try {
      const xml = await fetchXml(url);
      const imapMatch = xml.match(/<incomingServer type="imap"[^>]*>[\s\S]*?<hostname>(.*?)<\/hostname>[\s\S]*?<port>(.*?)<\/port>[\s\S]*?<socketType>(.*?)<\/socketType>/i);
      const smtpMatch = xml.match(/<outgoingServer type="smtp"[^>]*>[\s\S]*?<hostname>(.*?)<\/hostname>[\s\S]*?<port>(.*?)<\/port>[\s\S]*?<socketType>(.*?)<\/socketType>/i);

      if (imapMatch && smtpMatch) {
        return {
          imap_host: imapMatch[1],
          imap_port: parseInt(imapMatch[2], 10),
          imap_secure: imapMatch[3].toLowerCase() !== 'starttls',
          smtp_host: smtpMatch[1],
          smtp_port: parseInt(smtpMatch[2], 10),
          smtp_secure: smtpMatch[3].toLowerCase() !== 'starttls',
        };
      }
    } catch (_) {
      // Try next URL
    }
  }

  // Titan Email defaults
  if (domain.includes('titan') || domain.includes('email.titan')) {
    return {
      imap_host: 'imap.titan.email',
      imap_port: 993,
      imap_secure: true,
      smtp_host: 'smtp.titan.email',
      smtp_port: 465,
      smtp_secure: true,
    };
  }

  // Common provider defaults
  const providers = {
    'gmail.com': { imap_host: 'imap.gmail.com', imap_port: 993, imap_secure: true, smtp_host: 'smtp.gmail.com', smtp_port: 465, smtp_secure: true },
    'outlook.com': { imap_host: 'outlook.office365.com', imap_port: 993, imap_secure: true, smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_secure: false },
    'hotmail.com': { imap_host: 'outlook.office365.com', imap_port: 993, imap_secure: true, smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_secure: false },
    'yahoo.com': { imap_host: 'imap.mail.yahoo.com', imap_port: 993, imap_secure: true, smtp_host: 'smtp.mail.yahoo.com', smtp_port: 465, smtp_secure: true },
  };

  if (providers[domain]) return providers[domain];

  // DNS MX Record Lookup
  try {
    const dns = require('dns').promises;
    const mxRecords = await dns.resolveMx(domain);
    if (mxRecords && mxRecords.length > 0) {
      // Sort by priority (lowest number = highest priority)
      mxRecords.sort((a, b) => a.priority - b.priority);
      const mx = mxRecords[0].exchange.toLowerCase();

      if (mx.includes('titan.email')) {
        return { imap_host: 'imap.titan.email', imap_port: 993, imap_secure: true, smtp_host: 'smtp.titan.email', smtp_port: 465, smtp_secure: true };
      }
      if (mx.includes('google.com') || mx.includes('googlemail.com')) {
        return { imap_host: 'imap.gmail.com', imap_port: 993, imap_secure: true, smtp_host: 'smtp.gmail.com', smtp_port: 465, smtp_secure: true };
      }
      if (mx.includes('outlook.com') || mx.includes('protection.outlook.com')) {
        return { imap_host: 'outlook.office365.com', imap_port: 993, imap_secure: true, smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_secure: false };
      }
      if (mx.includes('zoho.com') || mx.includes('zoho.in') || mx.includes('zoho.eu')) {
        return { imap_host: 'imap.zoho.com', imap_port: 993, imap_secure: true, smtp_host: 'smtp.zoho.com', smtp_port: 465, smtp_secure: true };
      }
      if (mx.includes('yahoodns.net')) {
        return { imap_host: 'imap.mail.yahoo.com', imap_port: 993, imap_secure: true, smtp_host: 'smtp.mail.yahoo.com', smtp_port: 465, smtp_secure: true };
      }
      if (mx.includes('fastmail.com')) {
        return { imap_host: 'imap.fastmail.com', imap_port: 993, imap_secure: true, smtp_host: 'smtp.fastmail.com', smtp_port: 465, smtp_secure: true };
      }
      if (mx.includes('hostinger.com')) {
        return { imap_host: 'imap.hostinger.com', imap_port: 993, imap_secure: true, smtp_host: 'smtp.hostinger.com', smtp_port: 465, smtp_secure: true };
      }
    }
  } catch (err) {
    console.error(`[AutoDiscover] MX lookup failed for ${domain}:`, err.message);
  }

  // Generic fallback (assume mail server is at imap.domain.com / smtp.domain.com)
  return {
    imap_host: `imap.${domain}`,
    imap_port: 993,
    imap_secure: true,
    smtp_host: `smtp.${domain}`,
    smtp_port: 465,
    smtp_secure: true,
  };
}

module.exports = {
  createImapClient,
  testImapConnection,
  syncMailboxHeaders,
  fetchEmailBody,
  fetchLatestEmailFull,
  fetchUnreadCount,
  fetchMailboxes,
  setMessageFlags,
  deleteMessage,
  moveMessage,
  sendEmail,
  autoDiscover,
};
