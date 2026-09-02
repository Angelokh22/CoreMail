import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Inbox, Send, FileText, Archive, Trash2, Star, AlertOctagon, FolderOpen, Layers, Clock
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
    accounts,
    settings,
    refreshLocalEmails,
    showStarred,
    setShowStarred,
  } = useApp();

  const isUnified = settings.unified_inbox !== 'false';

  // Total unread across all accounts for unified inbox badge
  const totalUnread = Object.values(unreadCounts).reduce((sum, c) => sum + c, 0);

  const inboxUnread = selectedAccount
    ? (unreadCounts[selectedAccount.id] || 0)
    : 0;

  // Helper to map system keys to real IMAP paths
  const getSystemFolderPath = (key) => {
    const flagMap = {
      'Sent': '\\Sent',
      'Drafts': '\\Drafts',
      'Archive': '\\Archive',
      'Spam': '\\Junk',
      'Trash': '\\Trash',
      'INBOX': '\\Inbox'
    };
    const targetFlag = flagMap[key];
    if (targetFlag) {
      const match = mailboxes.find(m => m.flags?.some(f => f.toLowerCase() === targetFlag.toLowerCase()));
      if (match) return match.path;
    }
    const nameMatch = mailboxes.find(m => m.name.toLowerCase() === key.toLowerCase() || m.path.toLowerCase() === key.toLowerCase());
    if (nameMatch) return nameMatch.path;
    return key;
  };

  // Build unique set from server mailbox list, excluding those matched to system folders
  const systemPaths = new Set(SYSTEM_FOLDERS.map(s => getSystemFolderPath(s.key)));
  const extraMailboxes = mailboxes.filter(m => !systemPaths.has(m.path) && m.path !== '[Gmail]');

  const snoozedCount = emails.filter((e) => e.snooze_until && new Date(e.snooze_until) > new Date()).length;

  const handleSelect = (key) => {
    // If it's a known special view, use it directly
    if (key === '__unified__' || key === '__snoozed__') {
      setSelectedMailbox(key);
    } else {
      setSelectedMailbox(getSystemFolderPath(key));
    }
    setSelectedEmail(null);
    setShowStarred(false);
  };

  const handleStarred = () => {
    setShowStarred(true);
    setSelectedEmail(null);
  };

  const starredCount = emails.filter((e) => e.is_starred).length;

  const isActive = (key) => {
    if (showStarred) return false;
    if (key === '__unified__' || key === '__snoozed__') return selectedMailbox === key;
    return selectedMailbox === getSystemFolderPath(key);
  };

  return (
    <aside className="sidebar d-flex flex-column">
      <nav className="p-2">
        <ul className="list-unstyled mb-0">

          {/* All Inboxes (unified) */}
          {isUnified && (
            <li>
              <button
                className={`sidebar-item btn btn-link w-100 d-flex align-items-center gap-2 text-start py-2 px-3 rounded
                  ${isActive('__unified__') ? 'active' : ''}`}
                onClick={() => handleSelect('__unified__')}
              >
                <Layers size={15} />
                <span className="flex-grow-1">All Inboxes</span>
                {totalUnread > 0 && (
                  <span className="badge bg-primary rounded-pill" style={{ fontSize: 10 }}>
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </button>
            </li>
          )}

          {/* System mailboxes — always show all including Inbox */}
          {SYSTEM_FOLDERS.map(({ key, label, icon: Icon }) => (
            <li key={key}>
              <button
                className={`sidebar-item btn btn-link w-100 d-flex align-items-center gap-2 text-start py-2 px-3 rounded
                  ${isActive(key) ? 'active' : ''}`}
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

          {/* Snoozed */}
          <li>
            <button
              className={`sidebar-item btn btn-link w-100 d-flex align-items-center gap-2 text-start py-2 px-3 rounded
                ${isActive('__snoozed__') ? 'active' : ''}`}
              onClick={() => handleSelect('__snoozed__')}
            >
              <Clock size={15} />
              <span className="flex-grow-1">Snoozed</span>
              {snoozedCount > 0 && (
                <span className="badge bg-info text-dark rounded-pill" style={{ fontSize: 10 }}>
                  {snoozedCount}
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
                      ${isActive(m.path) ? 'active' : ''}`}
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
