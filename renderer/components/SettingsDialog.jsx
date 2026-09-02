import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Trash2, Settings, Moon, Sun, Bell, Power, Edit2, Check, X, Monitor, Users, Plus, Layers } from 'lucide-react';

// ── Account edit row ──────────────────────────────────────────────────────────
function AccountEditItem({ account }) {
  const { updateAccount, deleteAccount, showToast } = useApp();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const [saving, setSaving] = useState(false);

  const handleDelete = async () => {
    if (window.confirm(`Remove "${account.name}" (${account.email})? This will not delete your emails from the server.`)) {
      await deleteAccount(account.id);
      showToast('Account removed', account.email, 'secondary');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAccount(account.id, { name });
      setEditing(false);
      showToast('Account renamed', '', 'success');
    } catch (e) {
      showToast('Error', e.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="list-group-item d-flex align-items-center gap-3">
      <div
        className="rounded-circle d-flex align-items-center justify-content-center fw-bold flex-shrink-0"
        style={{ width: 36, height: 36, background: account.avatar_color || '#6c757d', color: '#fff', fontSize: 14 }}
      >
        {(account.name || account.email)[0].toUpperCase()}
      </div>
      <div className="flex-grow-1 overflow-hidden">
        {editing ? (
          <input
            type="text"
            className="form-control form-control-sm mb-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            autoFocus
          />
        ) : (
          <div className="fw-semibold text-truncate" style={{ fontSize: 13 }}>{account.name}</div>
        )}
        <div className="text-secondary text-truncate" style={{ fontSize: 11 }}>{account.email}</div>
        <div className="text-secondary" style={{ fontSize: 10 }}>
          IMAP: {account.imap_host}:{account.imap_port} · SMTP: {account.smtp_host}:{account.smtp_port}
        </div>
      </div>
      {editing ? (
        <div className="d-flex gap-1 flex-shrink-0">
          <button className="btn btn-sm btn-outline-success" onClick={handleSave} disabled={saving}><Check size={13} /></button>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => { setEditing(false); setName(account.name); }} disabled={saving}><X size={13} /></button>
        </div>
      ) : (
        <div className="d-flex gap-1 flex-shrink-0">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(true)} title="Rename account"><Edit2 size={13} /></button>
          <button className="btn btn-sm btn-outline-danger" onClick={handleDelete} title="Remove account"><Trash2 size={13} /></button>
        </div>
      )}
    </li>
  );
}

// ── Recipient Group editor ────────────────────────────────────────────────────
function GroupEditor({ group, onSave, onCancel }) {
  const [name, setName] = useState(group?.name || '');
  const [members, setMembers] = useState(group?.members || []);
  const [input, setInput] = useState('');

  const addMember = () => {
    const t = input.trim();
    if (t && !members.includes(t)) setMembers((p) => [...p, t]);
    setInput('');
  };

  const removeMember = (m) => setMembers((p) => p.filter((e) => e !== m));

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addMember(); }
  };

  return (
    <div className="p-3 border rounded mb-3">
      <div className="mb-2">
        <label className="form-label small fw-semibold">Group Name</label>
        <input
          className="form-control form-control-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Team, Family, Clients…"
          autoFocus
        />
      </div>
      <div className="mb-2">
        <label className="form-label small fw-semibold">Members</label>
        <div className="chip-input d-flex flex-wrap gap-1 p-1 border rounded border-secondary bg-transparent mb-1">
          {members.map((m) => (
            <span key={m} className="badge bg-primary d-flex align-items-center gap-1" style={{ fontSize: 11 }}>
              {m}
              <button type="button" className="btn-close btn-close-white" style={{ fontSize: 7 }} onClick={() => removeMember(m)} />
            </span>
          ))}
          <input
            type="email"
            className="flex-grow-1 bg-transparent border-0 text-light"
            style={{ minWidth: 160, outline: 'none', fontSize: 12 }}
            placeholder="Add email and press Enter…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={(e) => {
              // Ignore blur if they are clicking Save or Cancel buttons
              if (e.relatedTarget && e.relatedTarget.tagName === 'BUTTON') return;
              addMember();
            }}
          />
        </div>
      </div>
      <div className="d-flex gap-2">
        <button className="btn btn-sm btn-primary" onClick={() => onSave(name, members)} disabled={!name.trim() || members.length === 0}>
          <Check size={12} className="me-1" /> Save
        </button>
        <button className="btn btn-sm btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── Main Settings Dialog ──────────────────────────────────────────────────────
export default function SettingsDialog({ onClose }) {
  const { accounts, settings, saveSetting, showToast, groups, createGroup, updateGroup, deleteGroup } = useApp();
  const [activeTab, setActiveTab] = useState('general');
  const [editingGroup, setEditingGroup] = useState(null); // null | 'new' | group object
  const [isDefaultApp, setIsDefaultApp] = useState(false);

  React.useEffect(() => {
    window.electronAPI.isDefaultProtocolClient('mailto').then(setIsDefaultApp);
  }, []);

  const handleMakeDefault = async () => {
    const success = await window.electronAPI.setAsDefaultProtocolClient('mailto');
    if (success) {
      if (window.electronAPI.platform === 'win32') {
        showToast('Info', 'Opening Windows Settings. Please select CoreMail under Email.', 'primary');
        window.electronAPI.openExternal('ms-settings:defaultapps');
      } else {
        setIsDefaultApp(true);
        showToast('Success', 'CoreMail is now your default email app.', 'success');
      }
    } else {
      showToast('Error', 'Could not set as default app. You may need to change this in your OS settings.', 'danger');
    }
  };

  const handleSaveGroup = async (name, members) => {
    try {
      if (editingGroup === 'new') {
        await createGroup(name, members);
        showToast('Group created', name, 'success');
      } else {
        await updateGroup(editingGroup.id, name, members);
        showToast('Group updated', name, 'success');
      }
      setEditingGroup(null);
    } catch (e) {
      showToast('Error', e.message, 'danger');
    }
  };

  const handleDeleteGroup = async (group) => {
    if (window.confirm(`Delete group "${group.name}"?`)) {
      await deleteGroup(group.id);
      showToast('Group deleted', group.name, 'secondary');
    }
  };

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.6)', zIndex: 10000 }}>
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title d-flex align-items-center gap-2">
              <Settings size={18} /> Settings
            </h5>
            <button className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body p-0 d-flex" style={{ minHeight: 440 }}>
            {/* Tabs sidebar */}
            <div className="border-end" style={{ width: 160 }}>
              <ul className="nav flex-column p-2 gap-1">
                {[
                  { key: 'general', label: 'General', icon: Settings },
                  { key: 'accounts', label: 'Accounts', icon: Power },
                  { key: 'notifications', label: 'Notifications', icon: Bell },
                  { key: 'groups', label: 'Groups', icon: Users },
                ].map(({ key, label, icon: Icon }) => (
                  <li className="nav-item" key={key}>
                    <button
                      className={`btn btn-link w-100 text-start d-flex align-items-center gap-2 py-2 px-3 rounded ${activeTab === key ? 'bg-primary text-white' : 'text-secondary'}`}
                      style={{ fontSize: 13, textDecoration: 'none' }}
                      onClick={() => setActiveTab(key)}
                    >
                      <Icon size={14} /> {label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tab content */}
            <div className="flex-grow-1 p-4 overflow-y-auto">

              {/* ── General ── */}
              {activeTab === 'general' && (
                <div>
                  <h6 className="fw-semibold mb-4">General Settings</h6>

                  {/* Theme */}
                  <div className="mb-4">
                    <label className="form-label fw-semibold">Theme</label>
                    <div className="d-flex gap-2">
                      {['dark', 'light', 'system'].map((t) => (
                        <button
                          key={t}
                          className={`btn btn-sm d-flex align-items-center gap-2 ${settings.theme === t || (!settings.theme && t === 'dark') ? 'btn-primary' : 'btn-outline-secondary'}`}
                          onClick={() => saveSetting('theme', t)}
                        >
                          {t === 'dark' && <Moon size={13} />}
                          {t === 'light' && <Sun size={13} />}
                          {t === 'system' && <Monitor size={13} />}
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font size */}
                  <div className="mb-4">
                    <label className="form-label fw-semibold">Font Size</label>
                    <div className="d-flex gap-2">
                      {[
                        { key: 'small', label: 'Small' },
                        { key: 'medium', label: 'Medium' },
                        { key: 'large', label: 'Large' },
                      ].map(({ key, label }) => (
                        <button
                          key={key}
                          className={`btn btn-sm ${(settings.font_size || 'medium') === key ? 'btn-primary' : 'btn-outline-secondary'}`}
                          onClick={() => saveSetting('font_size', key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Avatar Style */}
                  <div className="mb-4">
                    <label className="form-label fw-semibold">Avatar Style</label>
                    <div className="d-flex gap-2">
                      {[
                        { key: 'gravatar', label: 'Photo (Gravatar)' },
                        { key: 'initials', label: 'Initials Only' },
                        { key: 'fun', label: 'Fun Shapes' },
                      ].map(({ key, label }) => (
                        <button
                          key={key}
                          className={`btn btn-sm ${(settings.avatar_style || 'gravatar') === key ? 'btn-primary' : 'btn-outline-secondary'}`}
                          onClick={() => saveSetting('avatar_style', key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Unified Inbox */}
                  <div className="mb-4">
                    <div className="form-check form-switch">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="unifiedInbox"
                        checked={settings.unified_inbox !== 'false'}
                        onChange={(e) => saveSetting('unified_inbox', e.target.checked ? 'true' : 'false')}
                      />
                      <label className="form-check-label fw-semibold" htmlFor="unifiedInbox">
                        Unified Inbox
                      </label>
                    </div>
                    <p className="text-secondary mt-1" style={{ fontSize: 12 }}>
                      Show emails from all accounts together in a single "All Inboxes" view.
                    </p>
                  </div>

                  {/* Default Mail Client */}
                  <div className="mb-4">
                    <label className="form-label fw-semibold">Default Email Client</label>
                    <div className="d-flex align-items-center gap-2">
                      <button
                        className="btn btn-sm btn-outline-primary"
                        onClick={handleMakeDefault}
                        disabled={isDefaultApp}
                      >
                        {isDefaultApp ? 'CoreMail is your default app' : 'Set as Default App'}
                      </button>
                    </div>
                    <p className="text-secondary mt-1" style={{ fontSize: 12 }}>
                      Allows CoreMail to automatically open when you click on email links.
                    </p>
                  </div>

                  {/* Launch at startup */}
                  <div className="mb-4">
                    <div className="form-check form-switch">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="launchStartup"
                        checked={settings.launch_at_startup === 'true'}
                        onChange={(e) => saveSetting('launch_at_startup', e.target.checked ? 'true' : 'false')}
                      />
                      <label className="form-check-label fw-semibold" htmlFor="launchStartup">
                        Launch at startup
                      </label>
                    </div>
                    <p className="text-secondary mt-1" style={{ fontSize: 12 }}>
                      Start CoreMail automatically when your computer starts.
                    </p>
                  </div>

                  {/* Sync interval */}
                  <div className="mb-4">
                    <label className="form-label fw-semibold">Sync interval (seconds)</label>
                    <input
                      type="number"
                      className="form-control"
                      style={{ maxWidth: 120 }}
                      value={settings.sync_interval_seconds || 60}
                      min={10}
                      max={3600}
                      onChange={(e) => saveSetting('sync_interval_seconds', Number(e.target.value) || 60)}
                    />
                    <p className="text-secondary mt-1" style={{ fontSize: 12 }}>
                      Fallback poll interval. IMAP IDLE provides real-time push when supported.
                    </p>
                  </div>
                </div>
              )}

              {/* ── Accounts ── */}
              {activeTab === 'accounts' && (
                <div>
                  <h6 className="fw-semibold mb-4">Manage Accounts</h6>
                  {accounts.length === 0 && (
                    <p className="text-secondary" style={{ fontSize: 13 }}>No accounts added yet.</p>
                  )}
                  <ul className="list-group">
                    {accounts.map((acc) => (
                      <AccountEditItem key={acc.id} account={acc} />
                    ))}
                  </ul>
                </div>
              )}

              {/* ── Notifications ── */}
              {activeTab === 'notifications' && (
                <div>
                  <h6 className="fw-semibold mb-4">Notification Settings</h6>
                  <div className="mb-4">
                    <div className="form-check form-switch">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="notifSound"
                        checked={settings.notification_sound === 'true'}
                        onChange={(e) => saveSetting('notification_sound', e.target.checked ? 'true' : 'false')}
                      />
                      <label className="form-check-label fw-semibold" htmlFor="notifSound">
                        Sound on new email
                      </label>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="form-check form-switch">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="readReceiptDefault"
                        checked={settings.read_receipts_enabled === 'true'}
                        onChange={(e) => saveSetting('read_receipts_enabled', e.target.checked ? 'true' : 'false')}
                      />
                      <label className="form-check-label fw-semibold" htmlFor="readReceiptDefault">
                        Request read receipts by default
                      </label>
                    </div>
                    <p className="text-secondary mt-1" style={{ fontSize: 12 }}>
                      Adds a <code>Disposition-Notification-To</code> header to all sent emails.
                    </p>
                  </div>
                </div>
              )}

              {/* ── Groups ── */}
              {activeTab === 'groups' && (
                <div>
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <h6 className="fw-semibold mb-0">Recipient Groups</h6>
                    {editingGroup === null && (
                      <button
                        className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1"
                        onClick={() => setEditingGroup('new')}
                      >
                        <Plus size={13} /> New Group
                      </button>
                    )}
                  </div>

                  {editingGroup !== null && (
                    <GroupEditor
                      group={editingGroup === 'new' ? null : editingGroup}
                      onSave={handleSaveGroup}
                      onCancel={() => setEditingGroup(null)}
                    />
                  )}

                  {groups.length === 0 && editingGroup === null && (
                    <div className="text-center text-secondary py-5">
                      <Users size={32} className="mb-2 opacity-50" />
                      <p style={{ fontSize: 13 }}>No recipient groups yet.</p>
                      <p style={{ fontSize: 12 }}>Create a group to quickly add multiple recipients when composing.</p>
                    </div>
                  )}

                  <ul className="list-group">
                    {groups.map((g) => (
                      <li key={g.id} className="list-group-item d-flex align-items-center gap-3">
                        <div
                          className="rounded d-flex align-items-center justify-content-center flex-shrink-0"
                          style={{ width: 36, height: 36, background: '#0d6efd22' }}
                        >
                          <Users size={16} className="text-primary" />
                        </div>
                        <div className="flex-grow-1 overflow-hidden">
                          <div className="fw-semibold" style={{ fontSize: 13 }}>{g.name}</div>
                          <div className="text-secondary text-truncate" style={{ fontSize: 11 }}>
                            {g.members.join(', ')}
                          </div>
                        </div>
                        <div className="d-flex gap-1 flex-shrink-0">
                          <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditingGroup(g)} title="Edit">
                            <Edit2 size={12} />
                          </button>
                          <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteGroup(g)} title="Delete">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}
