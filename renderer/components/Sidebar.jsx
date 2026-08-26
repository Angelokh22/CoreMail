import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Inbox, Send, FileText, Archive, Trash2, Star, AlertOctagon, FolderOpen
} from 'lucide-react';

const SYSTEM_FOLDERS = [
  { key: 'INBOX',   label: 'Inbox',   icon: Inbox },
  { key: 'Sent',    label: 'Sent',    icon: Send },
  { key: 'Drafts',  label: 'Drafts',  icon: FileText },
  { key: 'Archive', label: 'Archive', icon: Archive },
  { key: 'Spam',    label: 'Spam',    icon: AlertOctagon },
  { key: 'Trash',   label: 'Trash',   icon: Trash2 },
];

export default function Sidebar() {
  const {
    selectedMailbox,
    setSelectedMailbox,
    setSelectedEmail,
    mailboxes,
    emails,
    unreadCounts,
    selectedAccount,
  } = useApp();

  const [showStarred, setShowStarred] = useState(false);

  const inboxUnread = selectedAccount
    ? (unreadCounts[selectedAccount.id] || 0)
    : 0;

  // Build unique set from server mailbox list + system defaults
  const serverMailboxNames = new Set(mailboxes.map((m) => m.name.toLowerCase()));
  const extraMailboxes = mailboxes.filter(
    (m) =>
      !SYSTEM_FOLDERS.some(
        (s) => s.label.toLowerCase() === m.name.toLowerCase() || s.key.toLowerCase() === m.path.toLowerCase()
      )
  );

  const handleSelect = (key) => {
    setSelectedMailbox(key);
    setSelectedEmail(null);
    setShowStarred(false);
  };

  const handleStarred = () => {
    setShowStarred(true);
    setSelectedEmail(null);
  };

  const starredCount = emails.filter((e) => e.is_starred).length;

  return (
    <aside className="sidebar d-flex flex-column">
      {/* System mailboxes */}
      <nav className="p-2">
        <ul className="list-unstyled mb-0">
          {SYSTEM_FOLDERS.map(({ key, label, icon: Icon }) => (
            <li key={key}>
              <button
                className={`sidebar-item btn btn-link w-100 d-flex align-items-center gap-2 text-start py-2 px-3 rounded
                  ${!showStarred && selectedMailbox === key ? 'active' : ''}`}
                onClick={() => handleSelect(key)}
              >
                <Icon size={15} />
                <span className="flex-grow-1">{label}</span>
                {key === 'INBOX' && inboxUnread > 0 && (
                  <span className="badge bg-primary rounded-pill" style={{ fontSize: 10 }}>
                    {inboxUnread > 99 ? '99+' : inboxUnread}
                  </span>
                )}
              </button>
            </li>
          ))}

          {/* Starred */}
          <li>
            <button
              className={`sidebar-item btn btn-link w-100 d-flex align-items-center gap-2 text-start py-2 px-3 rounded
                ${showStarred ? 'active' : ''}`}
              onClick={handleStarred}
            >
              <Star size={15} />
              <span className="flex-grow-1">Starred</span>
              {starredCount > 0 && (
                <span className="badge bg-warning text-dark rounded-pill" style={{ fontSize: 10 }}>
                  {starredCount}
                </span>
              )}
            </button>
          </li>
        </ul>

        {/* Extra server-side folders */}
        {extraMailboxes.length > 0 && (
          <>
            <div className="sidebar-section-label px-3 mt-3 mb-1">Folders</div>
            <ul className="list-unstyled mb-0">
              {extraMailboxes.map((m) => (
                <li key={m.path}>
                  <button
                    className={`sidebar-item btn btn-link w-100 d-flex align-items-center gap-2 text-start py-2 px-3 rounded
                      ${!showStarred && selectedMailbox === m.path ? 'active' : ''}`}
                    onClick={() => handleSelect(m.path)}
                  >
                    <FolderOpen size={15} />
                    <span className="flex-grow-1 text-truncate">{m.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>
    </aside>
  );
}
