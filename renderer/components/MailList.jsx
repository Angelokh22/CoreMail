import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Star, Paperclip, RefreshCw } from 'lucide-react';

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

function EmailRow({ email, isSelected, onClick, onToggleStar }) {
  const attachments = JSON.parse(email.attachments || '[]');
  const hasAttachment = attachments.length > 0;
  const isUnread = !email.is_read;

  return (
    <div
      className={`email-row d-flex gap-2 px-3 py-2 border-bottom border-secondary border-opacity-25
        ${isSelected ? 'email-row--selected' : ''}
        ${isUnread ? 'email-row--unread' : ''}
      `}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
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

      {/* Content */}
      <div className="flex-grow-1 overflow-hidden">
        <div className="d-flex align-items-center justify-content-between mb-1">
          <span
            className={`text-truncate ${isUnread ? 'fw-semibold' : 'fw-normal'}`}
            style={{ fontSize: 13, maxWidth: '65%' }}
          >
            {email.from_name || email.from_email}
          </span>
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
  } = useApp();

  const displayEmails = useMemo(() => {
    // When "Starred" virtual mailbox is active (handled by sidebar showStarred state is not passed here)
    return emails;
  }, [emails]);

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
        <span className="fw-semibold" style={{ fontSize: 14 }}>
          {selectedMailbox}
        </span>
        <span className="text-secondary" style={{ fontSize: 11 }}>
          {displayEmails.length} messages
        </span>
      </div>

      {/* Email rows */}
      <div 
        className="flex-grow-1 overflow-y-auto pb-4" 
        onScroll={(e) => {
          const { scrollTop, scrollHeight, clientHeight } = e.target;
          // If scrolled to within 50px of the bottom, load more
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
              <p className="mb-1" style={{ fontSize: 28 }}>📭</p>
              <p style={{ fontSize: 13 }}>No emails here</p>
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
