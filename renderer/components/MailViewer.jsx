import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Reply, Forward, Trash2, Star, Paperclip, MailOpen, Clock } from 'lucide-react';
import ComposeDialog from './ComposeDialog';
import Avatar from './Avatar';

function formatFullDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString([], {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SnoozePicker({ onSnooze, onClose }) {
  const now = new Date();
  const laterToday = new Date(now); laterToday.setHours(now.getHours() + 3, 0, 0, 0);
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
  const nextWeek = new Date(now); nextWeek.setDate(now.getDate() + 7); nextWeek.setHours(9, 0, 0, 0);

  const options = [
    { label: 'Later today', date: laterToday },
    { label: 'Tomorrow morning', date: tomorrow },
    { label: 'Next week', date: nextWeek },
  ];

  return (
    <div className="dropdown-menu show position-absolute" style={{ zIndex: 9999, right: 0, top: '100%', minWidth: 220 }}>
      {options.map(({ label, date }) => (
        <button key={label} className="dropdown-item" style={{ fontSize: 13 }}
          onClick={() => { onSnooze(date.toISOString()); onClose(); }}>
          <Clock size={12} className="me-2" />
          {label}
          <span className="text-secondary ms-2" style={{ fontSize: 11 }}>
            {date.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function MailViewer() {
  const { selectedEmail, setSelectedEmail, selectedAccount, deleteEmail, toggleStar, showToast, markUnread, snoozeEmail } = useApp();
  const [bodyEmail, setBodyEmail] = useState(null);
  const [composeMode, setComposeMode] = useState(null);
  const [showSnooze, setShowSnooze] = useState(false);
  const iframeRef = useRef(null);
  const snoozeRef = useRef(null);

  // Close snooze picker on outside click
  useEffect(() => {
    if (!showSnooze) return;
    const handler = (e) => { if (snoozeRef.current && !snoozeRef.current.contains(e.target)) setShowSnooze(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSnooze]);

  useEffect(() => {
    if (!selectedEmail) { setBodyEmail(null); return; }

    // If body is already cached from DB
    if (selectedEmail.body_html || selectedEmail.body_text) {
      setBodyEmail(selectedEmail);
      return;
    }

    // Fetch full body from server
    setBodyEmail(null);
    window.electronAPI
      .getEmailBody(selectedEmail.account_id, selectedEmail.mailbox || 'INBOX', selectedEmail.uid)
      .then((full) => setBodyEmail(full || selectedEmail));
  }, [selectedEmail]);

  // Safely inject HTML into iframe
  useEffect(() => {
    if (!iframeRef.current || !bodyEmail) return;
    const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document;
    if (!doc) return;
    const html = bodyEmail.body_html || `<pre style="font-family:inherit;white-space:pre-wrap">${bodyEmail.body_text || ''}</pre>`;
    doc.open();
    doc.write(`
      <html>
        <head>
          <base target="_blank">
          <style>
            body { margin: 12px 16px; font-family: -apple-system, sans-serif; font-size: 14px;
                   color: #dee2e6; background: transparent; word-break: break-word; }
            a { color: #6ea8fe; }
            img { max-width: 100%; height: auto; }
            blockquote { border-left: 3px solid #495057; padding-left: 12px; margin-left: 4px; color: #adb5bd; }
          </style>
        </head>
        <body>${html}</body>
      </html>
    `);
    doc.close();

    // Intercept all link clicks — open in system browser
    const handleClick = (e) => {
      const a = e.target.closest('a');
      if (a && a.href) {
        e.preventDefault();
        window.electronAPI.openExternal(a.href);
      }
    };
    doc.addEventListener('click', handleClick);
    return () => doc.removeEventListener('click', handleClick);
  }, [bodyEmail]);

  // ── Keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    if (!selectedEmail) return;
    const handler = (e) => {
      // Ignore shortcuts when typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setComposeMode({ mode: 'reply', email: selectedEmail });
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setComposeMode({ mode: 'forward', email: selectedEmail });
      } else if (e.key === 'Delete') {
        e.preventDefault();
        if (window.confirm('Delete this email?')) deleteEmail(selectedEmail.id);
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        markUnread(selectedEmail.id);
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        toggleStar(selectedEmail);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedEmail(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedEmail, deleteEmail, markUnread, toggleStar, setSelectedEmail]);

  if (!selectedEmail) {
    return (
      <div className="mail-viewer d-flex align-items-center justify-content-center text-secondary">
        <div className="text-center">
          <p style={{ fontSize: 48 }}>✉</p>
          <p>Select an email to read it</p>
          <p className="text-secondary" style={{ fontSize: 11 }}>
            Shortcuts: R=Reply, F=Forward, U=Unread, S=Star, Del=Delete, ESC=Close
          </p>
        </div>
      </div>
    );
  }

  const toList = (() => { try { return JSON.parse(selectedEmail.to_addresses || '[]'); } catch { return []; } })();
  const ccList = (() => { try { return JSON.parse(selectedEmail.cc_addresses || '[]'); } catch { return []; } })();
  const attachments = (() => { try { return JSON.parse(bodyEmail?.attachments || selectedEmail.attachments || '[]'); } catch { return []; } })();

  const handleDelete = async () => {
    if (window.confirm('Delete this email?')) {
      await deleteEmail(selectedEmail.id);
    }
  };

  const handleDownload = async (filename) => {
    try {
      const res = await window.electronAPI.downloadAttachment(selectedEmail.account_id, selectedEmail.mailbox || 'INBOX', selectedEmail.uid, filename);
      if (res.success) {
        showToast('Downloaded', `Saved ${filename}`, 'success');
      } else if (res.error !== 'Canceled') {
        showToast('Download Failed', res.error, 'danger');
      }
    } catch (err) {
      showToast('Download Error', err.message, 'danger');
    }
  };

  return (
    <div className="mail-viewer d-flex flex-column overflow-hidden">
      {/* Email header */}
      <div className="mail-viewer__header p-3 border-bottom border-secondary border-opacity-25">
        <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
          <h6 className="mb-0 fw-semibold flex-grow-1" style={{ fontSize: 16, lineHeight: 1.3 }}>
            {selectedEmail.subject || '(no subject)'}
          </h6>
          {/* Action buttons */}
          <div className="d-flex gap-1 flex-shrink-0">
            <button
              className="btn btn-sm btn-outline-secondary"
              title="Reply (R)"
              onClick={() => setComposeMode({ mode: 'reply', email: selectedEmail })}
            >
              <Reply size={13} />
            </button>
            <button
              className="btn btn-sm btn-outline-secondary"
              title="Forward (F)"
              onClick={() => setComposeMode({ mode: 'forward', email: selectedEmail })}
            >
              <Forward size={13} />
            </button>
            <button
              className="btn btn-sm btn-outline-secondary"
              title="Mark as Unread (U)"
              onClick={() => markUnread(selectedEmail.id)}
            >
              <MailOpen size={13} />
            </button>
            {/* Snooze button */}
            <div className="position-relative" ref={snoozeRef}>
              <button
                className="btn btn-sm btn-outline-secondary"
                title="Snooze"
                onClick={() => setShowSnooze((v) => !v)}
              >
                <Clock size={13} />
              </button>
              {showSnooze && (
                <SnoozePicker
                  onSnooze={(until) => snoozeEmail(selectedEmail.id, until)}
                  onClose={() => setShowSnooze(false)}
                />
              )}
            </div>
            <button
              className="btn btn-sm btn-outline-secondary"
              title={selectedEmail.is_starred ? 'Unstar (S)' : 'Star (S)'}
              onClick={() => toggleStar(selectedEmail)}
            >
              <Star
                size={13}
                fill={selectedEmail.is_starred ? '#ffc107' : 'none'}
                stroke={selectedEmail.is_starred ? '#ffc107' : 'currentColor'}
              />
            </button>
            <button
              className="btn btn-sm btn-outline-danger"
              title="Delete (Del)"
              onClick={handleDelete}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* From / To / Date */}
        <div className="d-flex gap-2 text-secondary" style={{ fontSize: 12 }}>
          <Avatar
            name={selectedEmail.from_name}
            email={selectedEmail.from_email}
            size={36}
          />
          <div className="flex-grow-1">
            <div>
              <span className="fw-semibold text-light">{selectedEmail.from_name || selectedEmail.from_email}</span>
              {selectedEmail.from_name && (
              <span className="ms-1 opacity-75">&lt;{selectedEmail.from_email}&gt;</span>
            )}
          </div>
          {toList.length > 0 && (
            <div className="mt-1">
              <span className="opacity-50 me-1">To:</span>
              {toList.join(', ')}
            </div>
          )}
          {ccList.length > 0 && (
            <div>
              <span className="opacity-50 me-1">CC:</span>
              {ccList.join(', ')}
            </div>
          )}
          <div className="mt-1 opacity-75">{formatFullDate(selectedEmail.date)}</div>
          </div>
        </div>
      </div>

      {/* Email body in sandboxed iframe */}
      <div className="flex-grow-1 overflow-hidden d-flex flex-column">
        {bodyEmail ? (
          <iframe
            ref={iframeRef}
            className="mail-viewer__iframe w-100 flex-grow-1 border-0"
            sandbox="allow-same-origin"
            title="Email content"
          />
        ) : (
          <div className="d-flex align-items-center justify-content-center flex-grow-1 text-secondary gap-2">
            <div className="spinner-border spinner-border-sm" /> Loading message…
          </div>
        )}

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="p-3 border-top border-secondary border-opacity-25">
            <div className="fw-semibold mb-2 text-secondary" style={{ fontSize: 12 }}>
              Attachments ({attachments.length})
            </div>
            <div className="d-flex flex-wrap gap-2">
              {attachments.map((att, i) => (
                <button
                  key={i}
                  className="btn btn-sm btn-secondary d-flex align-items-center gap-1 py-0 px-2"
                  style={{ fontSize: 11, minHeight: 24 }}
                  onClick={() => handleDownload(att.filename)}
                  title={`Download ${att.filename}`}
                >
                  <Paperclip size={10} />
                  {att.filename || 'Attachment'}
                  {att.size ? ` (${(att.size / 1024).toFixed(1)} KB)` : ''}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Reply/Forward dialog */}
      {composeMode && (
        <ComposeDialog
          mode={composeMode.mode}
          originalEmail={composeMode.email}
          onClose={() => setComposeMode(null)}
        />
      )}
    </div>
  );
}
