import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Trash2, Settings, Moon, Sun, Bell, Power, Edit2, Check, X, Monitor } from 'lucide-react';

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

export default function SettingsDialog({ onClose }) {
  const { accounts, settings, saveSetting, showToast } = useApp();
  const [activeTab, setActiveTab] = useState('general');

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

          <div className="modal-body p-0 d-flex" style={{ minHeight: 400 }}>
            {/* Tabs sidebar */}
            <div className="border-end" style={{ width: 160 }}>
              <ul className="nav flex-column p-2 gap-1">
                {[
                  { key: 'general', label: 'General', icon: Settings },
                  { key: 'accounts', label: 'Accounts', icon: Power },
                  { key: 'notifications', label: 'Notifications', icon: Bell },
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
            <div className="flex-grow-1 p-4">
              {/* General */}
              {activeTab === 'general' && (
                <div>
                  <h6 className="fw-semibold mb-4">General Settings</h6>

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
                      Start CoreMail automatically when Windows starts.
                    </p>
                  </div>

                  <div className="mb-4">
                    <label className="form-label fw-semibold">Sync interval (seconds)</label>
                    <input
                      type="number"
                      className="form-control"
                      style={{ maxWidth: 120 }}
                      value={settings.sync_interval_seconds || 60}
                      min={10}
                      max={3600}
                      onChange={(e) => saveSetting('sync_interval_seconds', e.target.value)}
                    />
                    <p className="text-secondary mt-1" style={{ fontSize: 12 }}>
                      Fallback poll interval. IMAP IDLE provides real-time push when supported.
                    </p>
                  </div>
                </div>
              )}

              {/* Accounts */}
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

              {/* Notifications */}
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
                      Adds a <code>Disposition-Notification-To</code> header to all sent emails. Recipients must
                      choose to send the receipt — it is not guaranteed.
                    </p>
                  </div>
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
