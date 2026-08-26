import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { X, Folder } from 'lucide-react';

const FOLDER_COLORS = [
  '#0d6efd', '#6f42c1', '#d63384', '#dc3545',
  '#fd7e14', '#ffc107', '#198754', '#20c997', '#0dcaf0',
];

export default function FolderDialog({ folder, onClose }) {
  const { accounts, folders, createFolder, updateFolder } = useApp();
  const isEdit = !!folder;

  const [name, setName] = useState(folder?.name || '');
  const [color, setColor] = useState(folder?.color || FOLDER_COLORS[0]);
  const [selectedIds, setSelectedIds] = useState(new Set(folder?.accountIds || []));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Accounts already in OTHER folders (not this one) cannot be selected when creating
  const alreadyGroupedIds = isEdit
    ? new Set(
        folders
          .filter((f) => f.id !== folder.id)
          .flatMap((f) => f.accountIds)
      )
    : new Set(folders.flatMap((f) => f.accountIds));

  const availableAccounts = isEdit
    ? accounts // when editing, show all; accounts in this folder are pre-checked
    : accounts.filter((a) => !alreadyGroupedIds.has(a.id));

  const toggleAccount = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Please enter a folder name.'); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await updateFolder(folder.id, name.trim(), color, [...selectedIds]);
      } else {
        await createFolder(name.trim(), color, [...selectedIds]);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.6)', zIndex: 10000 }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title d-flex align-items-center gap-2">
              <Folder size={18} style={{ color }} />
              {isEdit ? `Edit folder — ${folder.name}` : 'Create Folder'}
            </h5>
            <button className="btn-close" onClick={onClose} />
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {error && <div className="alert alert-danger py-2">{error}</div>}

              {/* Folder name */}
              <div className="mb-3">
                <label className="form-label fw-semibold">Folder Name</label>
                <input
                  className="form-control"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Work, Personal, Clients…"
                  autoFocus
                />
              </div>

              {/* Color picker */}
              <div className="mb-3">
                <label className="form-label fw-semibold">Color</label>
                <div className="d-flex gap-2 flex-wrap">
                  {FOLDER_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="color-swatch rounded-circle border-0"
                      style={{
                        width: 24,
                        height: 24,
                        background: c,
                        outline: color === c ? `3px solid white` : 'none',
                        outlineOffset: 2,
                        boxShadow: color === c ? `0 0 0 4px ${c}55` : 'none',
                      }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </div>

              {/* Account selection */}
              <div className="mb-2">
                <label className="form-label fw-semibold">
                  {isEdit
                    ? 'Accounts in this folder'
                    : `Select accounts to group (${availableAccounts.length} available)`}
                </label>
                {availableAccounts.length === 0 ? (
                  <p className="text-secondary small">
                    All accounts are already in folders. Remove them from their current folder to reassign.
                  </p>
                ) : (
                  <div
                    className="border rounded p-2 overflow-y-auto"
                    style={{ maxHeight: 220 }}
                  >
                    {availableAccounts.map((account) => {
                      const inOtherFolder = isEdit && alreadyGroupedIds.has(account.id);
                      return (
                        <div
                          key={account.id}
                          className={`form-check d-flex align-items-center gap-2 mb-1 ${inOtherFolder ? 'opacity-50' : ''}`}
                        >
                          <input
                            type="checkbox"
                            className="form-check-input"
                            id={`acc-${account.id}`}
                            checked={selectedIds.has(account.id)}
                            disabled={inOtherFolder}
                            onChange={() => toggleAccount(account.id)}
                          />
                          <label className="form-check-label d-flex flex-column" htmlFor={`acc-${account.id}`}>
                            <span className="fw-semibold" style={{ fontSize: 13 }}>{account.name}</span>
                            <span className="text-secondary" style={{ fontSize: 11 }}>{account.email}</span>
                            {inOtherFolder && (
                              <span className="text-warning" style={{ fontSize: 10 }}>
                                In another folder — edit that folder to reassign.
                              </span>
                            )}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Folder'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
