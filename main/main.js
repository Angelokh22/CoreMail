const {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  Tray,
  Menu,
  shell,
  nativeImage,
  dialog,
} = require('electron');
const path = require('path');
const db = require('./db');
const mailService = require('./mailService');
const syncWorker = require('./syncWorker');

// ─── Single instance lock ─────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let tray = null;

// ─── Window creation ──────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false,
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    show: false,
  });

  // Load the renderer
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of closing
    e.preventDefault();
    mainWindow.hide();
  });
}

// ─── System Tray ─────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open CoreMail',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.exit(0);
      },
    },
  ]);

  tray.setToolTip('CoreMail');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

function updateTrayTooltip(totalUnread) {
  if (!tray) return;
  const label = totalUnread > 0 ? `CoreMail — ${totalUnread} unread` : 'CoreMail';
  tray.setToolTip(label);
}

// ─── Notifications ────────────────────────────────────────────────────────────
function showNotification(title, body, accountId) {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title,
    body,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    silent: false,
  });
  n.on('click', () => {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('push:notification-clicked', { accountId });
  });
  n.show();
}

// ─── Background Sync Setup ────────────────────────────────────────────────────
async function startSync() {
  const accounts = db.accounts.getAll();
  await syncWorker.startAll(accounts);

  // On startup: update all unread badges directly from the server.
  // The renderer (AppContext) will automatically fetch the actual email bodies for the *selected* account.
  pushUnreadCounts();

  syncWorker.on('new-mail', async ({ accountId, account, data }) => {
    // Fetch only the latest message to show notification
    try {
      const email = await mailService.fetchLatestEmailFull(account, 'INBOX');
      if (email) {
        db.emails.upsert({ account_id: accountId, mailbox: 'INBOX', ...email });
        // Push to renderer
        mainWindow?.webContents.send('push:new-mail', { accountId, email });
        // Windows notification
        showNotification(
          `New email — ${account.name}`,
          `${email.from_name || email.from_email}: ${email.subject}`,
          accountId
        );
        // Update unread counts
        pushUnreadCounts();
      }
    } catch (err) {
      console.error('[Main] Error handling new-mail event:', err);
    }
  });
}

async function pushUnreadCounts() {
  const accounts = db.accounts.getAll();
  const counts = {};
  
  // Fetch actual counts from IMAP servers concurrently for speed
  await Promise.all(
    accounts.map(async (acc) => {
      counts[acc.id] = await mailService.fetchUnreadCount(acc, 'INBOX');
    })
  );

  const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
  updateTrayTooltip(total);
  mainWindow?.webContents.send('push:unread-counts', counts);
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// Accounts
ipcMain.handle('accounts:getAll', () => db.accounts.getAll());
ipcMain.handle('accounts:add', async (_e, data) => {
  // db.accounts.create() now returns the full inserted row directly
  const account = db.accounts.create(data);
  if (!account) return { error: 'Failed to create account' };

  // Start persistent IMAP IDLE for new mail push
  if (account.id) syncWorker.startAccount(account).catch(console.error);

  // Kick off initial INBOX fetch in background so emails appear immediately
  mailService.syncMailboxHeaders(account, 'INBOX', 100, 0, async (batch) => {
    for (const email of batch) {
      db.emails.upsert({ account_id: account.id, mailbox: 'INBOX', ...email });
    }
    pushUnreadCounts();
    // Tell the renderer to reload emails if this account is currently selected
    mainWindow?.webContents.send('push:sync-status', { accountId: account.id, done: true });
  }).catch((err) => console.error('[Main] Initial sync failed for', account.email, err.message));

  return account;
});
ipcMain.handle('accounts:update', async (_e, id, data) => {
  const existing = db.accounts.getById(id);
  if (!existing) throw new Error('Account not found');
  
  const merged = { ...existing, ...data };
  db.accounts.update(id, merged);
  
  const account = db.accounts.getById(id);
  await syncWorker.stopAccount(id);
  if (account?.id) syncWorker.startAccount(account).catch(console.error);
  return account;
});
ipcMain.handle('accounts:delete', async (_e, id) => {
  await syncWorker.stopAccount(id);
  db.accounts.delete(id);
  return { success: true };
});
ipcMain.handle('accounts:test', async (_e, data) => {
  try {
    await mailService.testImapConnection(data);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
ipcMain.handle('accounts:autoDiscover', async (_e, email) => {
  try {
    const settings = await mailService.autoDiscover(email);
    return { success: true, ...settings };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Folders
ipcMain.handle('folders:getAll', () => db.folders.getAll());
ipcMain.handle('folders:create', (_e, name, color, accountIds) => {
  const result = db.folders.create(name, color);
  const folderId = result.lastInsertRowid;
  if (accountIds?.length) db.folders.setAccounts(folderId, accountIds);
  return db.folders.getAll();
});
ipcMain.handle('folders:update', (_e, id, name, color, accountIds) => {
  db.folders.update(id, name, color, accountIds || []);
  return db.folders.getAll();
});
ipcMain.handle('folders:delete', (_e, id) => {
  db.folders.delete(id);
  return db.folders.getAll();
});

// Emails
ipcMain.handle('emails:get', (_e, accountId, mailbox = 'INBOX', limit = 5000) =>
  db.emails.getByAccountAndMailbox(accountId, mailbox, limit)
);
ipcMain.handle('emails:getUnified', (_e, limit = 5000) =>
  db.emails.getUnifiedInbox(limit)
);
ipcMain.handle('emails:getSnoozed', () => db.emails.getSnoozed());
ipcMain.handle('emails:search', (_e, query, accountId) =>
  db.emails.search(query, accountId || null)
);
ipcMain.handle('emails:getBody', async (_e, accountId, mailbox, uid) => {
  // Try cache first
  const account = db.accounts.getById(accountId);
  if (!account) return null;
  const cached = db.emails.getByAccountAndMailbox(accountId, mailbox, 5000).find(
    (e) => e.uid === uid
  );
  if (cached?.body_html || cached?.body_text) return cached;
  // Fetch from server
  const bodyData = await mailService.fetchEmailBody(account, mailbox, uid);
  if (bodyData) {
    const full = { ...cached, ...bodyData, account_id: accountId, mailbox };
    db.emails.upsert(full);
    return full;
  }
  return cached || null;
});

ipcMain.handle('emails:downloadAttachment', async (_e, accountId, mailbox, uid, filename) => {
  const account = db.accounts.getById(accountId);
  if (!account) return { success: false, error: 'Account not found' };
  
  // Prompt user for save location
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: filename,
    title: 'Save Attachment'
  });
  if (canceled || !filePath) return { success: false, error: 'Canceled' };

  try {
    const client = mailService.createImapClient(account);
    await client.connect();
    await client.mailboxOpen(mailbox);
    const { simpleParser } = require('mailparser');
    
    let saved = false;
    for await (const msg of client.fetch({ uid }, { uid: true, source: true })) {
      const parsed = await simpleParser(msg.source);
      const att = (parsed.attachments || []).find(a => a.filename === filename);
      if (att && att.content) {
        require('fs').writeFileSync(filePath, att.content);
        saved = true;
      }
    }
    await client.logout().catch(() => {});
    
    if (saved) return { success: true, filePath };
    return { success: false, error: 'Attachment not found in email source.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
ipcMain.handle('emails:sync', async (_e, accountId, mailbox = 'INBOX', limit = 100, offset = 0) => {
  const account = db.accounts.getById(accountId);
  if (!account) return { success: false, error: 'Account not found' };
  try {
    let fetchedCount = 0;
    const { total, fetched } = await mailService.syncMailboxHeaders(account, mailbox, limit, offset, async (batch, totalCount) => {
      for (const email of batch) {
        db.emails.upsert({ account_id: accountId, mailbox, ...email });
      }
      fetchedCount += batch.length;
      pushUnreadCounts();
      mainWindow?.webContents.send('push:sync-progress', {
        accountId, mailbox, fetchedCount, totalCount
      });
    });
    return { success: true, count: fetched, total };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
ipcMain.handle('emails:markRead', async (_e, emailId, isRead) => {
  const email = db.emails.getById(emailId);
  if (!email) return;
  db.emails.markRead(emailId, isRead);
  const account = db.accounts.getById(email.account_id);
  const flag = '\\Seen';
  await mailService
    .setMessageFlags(
      account,
      email.mailbox,
      email.uid,
      isRead ? [flag] : [],
      isRead ? [] : [flag]
    )
    .catch(console.error);
  pushUnreadCounts();
});
ipcMain.handle('emails:markStarred', async (_e, emailId, isStarred) => {
  const email = db.emails.getById(emailId);
  if (!email) return;
  db.emails.markStarred(emailId, isStarred);
  const account = db.accounts.getById(email.account_id);
  const flag = '\\Flagged';
  await mailService
    .setMessageFlags(
      account,
      email.mailbox,
      email.uid,
      isStarred ? [flag] : [],
      isStarred ? [] : [flag]
    )
    .catch(console.error);
});
ipcMain.handle('emails:snooze', (_e, emailId, until) => {
  db.emails.snooze(emailId, until);
  return { success: true };
});
ipcMain.handle('emails:delete', async (_e, emailId) => {
  const email = db.emails.getById(emailId);
  if (!email) return;
  const account = db.accounts.getById(email.account_id);
  await mailService.deleteMessage(account, email.mailbox, email.uid).catch(console.error);
  db.emails.delete(emailId);
  pushUnreadCounts();
});
ipcMain.handle('emails:move', async (_e, emailId, destMailbox) => {
  const email = db.emails.getById(emailId);
  if (!email) return;
  const account = db.accounts.getById(email.account_id);
  await mailService.moveMessage(account, email.mailbox, destMailbox, email.uid).catch(console.error);
  db.emails.delete(emailId);
});
ipcMain.handle('emails:send', async (_e, accountId, mailOptions) => {
  const account = db.accounts.getById(accountId);
  if (!account) return { success: false, error: 'Account not found' };
  try {
    const result = await mailService.sendEmail(account, mailOptions);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
ipcMain.handle('emails:getMailboxes', async (_e, accountId) => {
  const account = db.accounts.getById(accountId);
  if (!account) return [];
  try {
    return await mailService.fetchMailboxes(account);
  } catch (err) {
    return [];
  }
});

// Settings
ipcMain.handle('settings:getAll', () => db.settings.getAll());
ipcMain.handle('settings:set', (_e, key, value) => {
  db.settings.set(key, value);
  // Handle launch at startup
  if (key === 'launch_at_startup') {
    app.setLoginItemSettings({ openAtLogin: value === 'true' });
  }
});

// Recipient Groups
ipcMain.handle('groups:getAll', () => db.groups.getAll());
ipcMain.handle('groups:create', (_e, name, members) => db.groups.create(name, members));
ipcMain.handle('groups:update', (_e, id, name, members) => db.groups.update(id, name, members));
ipcMain.handle('groups:delete', (_e, id) => {
  db.groups.delete(id);
  return { success: true };
});

// Sync status
ipcMain.handle('sync:status', () => syncWorker.getStatus());

// Shell
ipcMain.handle('shell:openExternal', (_e, url) => shell.openExternal(url));

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // sql.js needs async WASM initialisation — must happen before any DB calls
  await db.init();
  createWindow();
  createTray();
  await startSync();

  // Auto-updater (production only)
  if (process.env.NODE_ENV !== 'development') {
    try {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.checkForUpdatesAndNotify();
      autoUpdater.on('update-downloaded', () => {
        showNotification('CoreMail Update Ready', 'Restart the app to apply the latest update.', null);
      });
    } catch (_) {
      // electron-updater may not be available in dev builds
    }
  }
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  // Keep app running in tray on Windows
  if (process.platform !== 'darwin') return;
  app.quit();
});

app.on('before-quit', async () => {
  await syncWorker.stopAll();
});
