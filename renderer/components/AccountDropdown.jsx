import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import FolderDialog from './FolderDialog';
import { Folder, ChevronDown, ChevronRight, User, Plus, FolderPlus, Trash2, Edit2 } from 'lucide-react';

function AccountAvatar({ account, size = 24 }) {
  const initials = account.name
    ? account.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : account.email[0].toUpperCase();
  return (
    <span
      className="account-avatar d-inline-flex align-items-center justify-content-center rounded-circle fw-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: account.avatar_color || '#6c757d',
        color: '#fff',
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}

function AccountItem({ account, isSelected, onSelect, unreadCount }) {
  return (
    <li>
      <button
        className={`dropdown-item d-flex align-items-center gap-2 py-2 ${isSelected ? 'active' : ''}`}
        onClick={() => onSelect(account)}
      >
        <AccountAvatar account={account} />
        <div className="flex-grow-1 text-start overflow-hidden">
          <div className="fw-semibold text-truncate" style={{ fontSize: 13 }}>
            {account.name}
          </div>
          <div className="text-truncate opacity-75" style={{ fontSize: 11 }}>
            {account.email}
          </div>
        </div>
        {unreadCount > 0 && (
          <span className="badge bg-primary rounded-pill" style={{ fontSize: 10 }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    </li>
  );
}

function FolderGroup({ folder, accounts, selectedAccount, onSelect, unreadCounts, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const memberAccounts = accounts.filter((a) => folder.accountIds.includes(a.id));

  return (
    <li className="folder-group">
      <div
        className="d-flex align-items-center gap-1 px-3 py-1 folder-group-header"
        onClick={() => setExpanded((v) => !v)}
        style={{ cursor: 'pointer' }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Folder size={13} style={{ color: folder.color }} />
        <span className="fw-semibold flex-grow-1" style={{ fontSize: 12, color: folder.color }}>
          {folder.name}
        </span>
        <button
          className="btn btn-link btn-sm p-0 text-secondary folder-action-btn"
          title="Edit folder"
          onClick={(e) => { e.stopPropagation(); onEdit(folder); }}
        >
          <Edit2 size={11} />
        </button>
        <button
          className="btn btn-link btn-sm p-0 text-danger folder-action-btn ms-1"
          title="Delete folder"
          onClick={(e) => { e.stopPropagation(); onDelete(folder.id); }}
        >
          <Trash2 size={11} />
        </button>
      </div>
      {expanded && (
        <ul className="list-unstyled mb-0 ps-2">
          {memberAccounts.map((account) => (
            <AccountItem
              key={account.id}
              account={account}
              isSelected={selectedAccount?.id === account.id}
              onSelect={onSelect}
              unreadCount={unreadCounts[account.id] || 0}
            />
          ))}
          {memberAccounts.length === 0 && (
            <li className="px-3 py-1 text-secondary" style={{ fontSize: 11 }}>
              No accounts in this folder
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

export default function AccountDropdown({ onAddAccount }) {
  const { accounts, folders, selectedAccount, setSelectedAccount, unreadCounts, deleteFolder, updateFolder } = useApp();
  const [open, setOpen] = useState(false);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null); // folder to edit, or null for create
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (account) => {
    setSelectedAccount(account);
    setOpen(false);
  };

  const handleEdit = (folder) => {
    setEditingFolder(folder);
    setShowFolderDialog(true);
  };

  const handleDelete = async (folderId) => {
    if (window.confirm('Delete this folder? Accounts will not be removed.')) {
      await deleteFolder(folderId);
    }
  };

  const groupedAccountIds = new Set(folders.flatMap((f) => f.accountIds));
  const ungroupedAccounts = accounts.filter((a) => !groupedAccountIds.has(a.id));

  const currentUnread = selectedAccount ? (unreadCounts[selectedAccount.id] || 0) : 0;

  return (
    <div className="dropdown" ref={ref}>
      <button
        className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-2"
        style={{ minWidth: 200 }}
        onClick={() => setOpen((v) => !v)}
      >
        {selectedAccount ? (
          <>
            <AccountAvatar account={selectedAccount} size={20} />
            <span className="text-truncate flex-grow-1 text-start" style={{ maxWidth: 140, fontSize: 13 }}>
              {selectedAccount.name || selectedAccount.email}
            </span>
          </>
        ) : (
          <span className="flex-grow-1 text-start" style={{ fontSize: 13 }}>Select account</span>
        )}
        {currentUnread > 0 && (
          <span className="badge bg-danger rounded-pill" style={{ fontSize: 10 }}>
            {currentUnread > 99 ? '99+' : currentUnread}
          </span>
        )}
        <ChevronDown size={12} />
      </button>

      {open && (
        <ul
          className="dropdown-menu show shadow-lg"
          style={{ minWidth: 260, maxHeight: 480, overflowY: 'auto', zIndex: 9999 }}
        >
          {/* Folder groups */}
          {folders.map((folder) => (
            <FolderGroup
              key={folder.id}
              folder={folder}
              accounts={accounts}
              selectedAccount={selectedAccount}
              onSelect={handleSelect}
              unreadCounts={unreadCounts}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}

          {/* Ungrouped accounts */}
          {ungroupedAccounts.length > 0 && (
            <>
              {folders.length > 0 && <li><hr className="dropdown-divider" /></li>}
              {ungroupedAccounts.map((account) => (
                <AccountItem
                  key={account.id}
                  account={account}
                  isSelected={selectedAccount?.id === account.id}
                  onSelect={handleSelect}
                  unreadCount={unreadCounts[account.id] || 0}
                />
              ))}
            </>
          )}

          {accounts.length === 0 && (
            <li className="px-3 py-2 text-secondary" style={{ fontSize: 12 }}>
              No accounts yet. Add one below.
            </li>
          )}

          {/* Actions */}
          <li><hr className="dropdown-divider" /></li>
          <li>
            <button
              className="dropdown-item d-flex align-items-center gap-2 py-2"
              onClick={() => { setOpen(false); onAddAccount(); }}
            >
              <Plus size={14} className="text-primary" />
              <span style={{ fontSize: 13 }}>New Account</span>
            </button>
          </li>
          <li>
            <button
              className="dropdown-item d-flex align-items-center gap-2 py-2"
              onClick={() => { setEditingFolder(null); setShowFolderDialog(true); setOpen(false); }}
              disabled={accounts.length === 0}
            >
              <FolderPlus size={14} className="text-warning" />
              <span style={{ fontSize: 13 }}>Create Folder</span>
            </button>
          </li>
        </ul>
      )}

      {/* Create / Edit Folder Modal */}
      {showFolderDialog && (
        <FolderDialog
          folder={editingFolder}
          onClose={() => { setShowFolderDialog(false); setEditingFolder(null); }}
        />
      )}
    </div>
  );
}
