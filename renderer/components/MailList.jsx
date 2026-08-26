import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Star, Paperclip, RefreshCw, MailOpen, Clock, Trash2 } from 'lucide-react';
import Avatar from './Avatar';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const diff = (now - d) / 86400000;
  if (diff < 7) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
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
    <div className="dropdown-menu show position-absolute" style={{ zIndex: 9999, right: 0, top: '100%' }}>
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

function EmailRow({ email, isSelected, onClick, onToggleStar, onMarkUnread, onSnooze, onDelete, showAccount }) {
  const [showSnooze, setShowSnooze] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);
  const attachments = JSON.parse(email.attachments || '[]');
  const hasAttachment = attachments.length > 0;
  const isUnread = !email.is_read;

  // Close context menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  return (
    <div
      className={`email-row d-flex gap-2 px-3 py-2 border-bottom border-secondary border-opacity-25
        ${isSelected ? 'email-row--selected' : ''}
        ${isUnread ? 'email-row--unread' : ''}
      `}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); setShowMenu(true); }}
      style={{ cursor: 'pointer', position: 'relative' }}
    >
      {/* Unread dot */}
      <div className="d-flex align-items-center pt-1" style={{ width: 10 }}>
        {isUnread && (
          <span
            className="rounded-circle bg-primary d-block"
            style={{ width: 7, height: 7 }}
          />
        )}
      </div>

      {/* Avatar */}
      <div className="d-flex align-items-center flex-shrink-0" style={{ width: 30 }}>
        <Avatar
          name={email.from_name}
          email={email.from_email}
          size={28}
        />
      </div>

      {/* Content */}
      <div className="flex-grow-1 overflow-hidden">
        <div className="d-flex align-items-center justify-content-between mb-1">
          <div className="d-flex align-items-center gap-1 overflow-hidden">
            <span
              className={`text-truncate ${isUnread ? 'fw-semibold' : 'fw-normal'}`}
              style={{ fontSize: 13, maxWidth: '65%' }}
            >
              {email.from_name || email.from_email}
            </span>
            {showAccount && email.account_name && (
              <span
                className="badge rounded-pill flex-shrink-0"
                style={{ fontSize: 9, background: email.account_color || '#6c757d' }}
              >
                {email.account_name}
              </span>
            )}
          </div>
          <div className="d-flex align-items-center gap-1">
            {hasAttachment && <Paperclip size={11} className="text-secondary" />}
            <span className="text-secondary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
              {formatDate(email.date)}
            </span>
          </div>
        </div>
        <div className="d-flex align-items-center justify-content-between gap-1">
          <span
            className={`text-truncate ${isUnread ? 'fw-medium' : 'text-secondary'}`}
            style={{ fontSize: 12 }}
          >
            {email.subject}
          </span>
          <button
            className="btn btn-link btn-sm p-0 flex-shrink-0"
            onClick={(e) => { e.stopPropagation(); onToggleStar(email); }}
            title={email.is_starred ? 'Unstar' : 'Star'}
          >
            <Star
              size={13}
              fill={email.is_starred ? '#ffc107' : 'none'}
              stroke={email.is_starred ? '#ffc107' : 'currentColor'}
            />
          </button>
        </div>
        <div className="text-secondary text-truncate" style={{ fontSize: 11 }}>
          {email.body_text?.slice(0, 80) || ''}
        </div>
      </div>

      {/* Right-click context menu */}
      {showMenu && (
        <div ref={menuRef} className="dropdown-menu show" style={{ position: 'absolute', right: 8, top: 8, zIndex: 9999, minWidth: 160 }}>
          <button className="dropdown-item d-flex align-items-center gap-2" style={{ fontSize: 13 }}
            onClick={(e) => { e.stopPropagation(); onMarkUnread(email.id); setShowMenu(false); }}>
            <MailOpen size={13} /> Mark as unread
          </button>
          <div className="position-relative">
            <button className="dropdown-item d-flex align-items-center gap-2" style={{ fontSize: 13 }}
              onClick={(e) => { e.stopPropagation(); setShowSnooze((v) => !v); }}>
              <Clock size={13} /> Snooze…
            </button>
            {showSnooze && (
              <SnoozePicker
                onSnooze={(until) => onSnooze(email.id, until)}
                onClose={() => { setShowSnooze(false); setShowMenu(false); }}
              />
            )}
          </div>
          <div className="dropdown-divider" />
          <button className="dropdown-item d-flex align-items-center gap-2 text-danger" style={{ fontSize: 13 }}
            onClick={(e) => { e.stopPropagation(); onDelete(email.id); setShowMenu(false); }}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default function MailList() {
  const {
    emails,
    selectedEmail,
    selectEmail,
    toggleStar,
    selectedMailbox,
    loading,
    selectedAccount,
    loadMoreEmails,
    searchQuery,
    searchResults,
    markUnread,
    snoozeEmail,
    deleteEmail,
    settings,
  } = useApp();

  const isSearchMode = searchQuery.trim().length > 0;
  const showAccount = selectedMailbox === '__unified__' || isSearchMode;
  const displayEmails = isSearchMode ? searchResults : emails;

  const mailboxLabel = isSearchMode
    ? `Search results for "${searchQuery}"`
    : selectedMailbox === '__snoozed__' ? 'Snoozed'
    : selectedMailbox === '__unified__' ? 'All Inboxes'
    : selectedMailbox;

  if (!selectedAccount) {
    return (
      <div className="mail-list d-flex align-items-center justify-content-center text-secondary">
        <div className="text-center">
          <p className="mb-2" style={{ fontSize: 32 }}>✉</p>
          <p>No account selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mail-list d-flex flex-column overflow-hidden">
      {/* List header */}
      <div className="px-3 py-2 border-bottom border-secondary border-opacity-25 d-flex align-items-center justify-content-between">
        <span className="fw-semibold text-truncate" style={{ fontSize: 14 }}>
          {mailboxLabel}
        </span>
        <span className="text-secondary flex-shrink-0" style={{ fontSize: 11 }}>
          {displayEmails.length} messages
        </span>
      </div>

      {/* Email rows */}
      <div
        className="flex-grow-1 overflow-y-auto pb-4"
        onScroll={(e) => {
          if (isSearchMode) return;
          const { scrollTop, scrollHeight, clientHeight } = e.target;
          if (scrollHeight - scrollTop - clientHeight < 50 && !loading) {
            loadMoreEmails();
          }
        }}
      >
        {loading && displayEmails.length === 0 && (
          <div className="d-flex align-items-center justify-content-center h-100 text-secondary gap-2">
            <RefreshCw size={14} className="spin" /> Loading…
          </div>
        )}
        {!loading && displayEmails.length === 0 && (
          <div className="d-flex align-items-center justify-content-center h-100 text-secondary">
            <div className="text-center">
              <p className="mb-1" style={{ fontSize: 28 }}>
                {isSearchMode ? '🔍' : '📭'}
              </p>
              <p style={{ fontSize: 13 }}>
                {isSearchMode ? 'No results found' : 'No emails here'}
              </p>
            </div>
          </div>
        )}
        {displayEmails.map((email) => (
          <EmailRow
            key={email.id}
            email={email}
            isSelected={selectedEmail?.id === email.id}
            onClick={() => selectEmail(email)}
            onToggleStar={toggleStar}
            onMarkUnread={markUnread}
            onSnooze={snoozeEmail}
            onDelete={deleteEmail}
            showAccount={showAccount}
          />
        ))}
        {loading && displayEmails.length > 0 && (
          <div className="py-3 text-center text-secondary d-flex justify-content-center align-items-center gap-2" style={{ fontSize: 12 }}>
            <RefreshCw size={12} className="spin" /> Loading more...
          </div>
        )}
      </div>
    </div>
  );
}
