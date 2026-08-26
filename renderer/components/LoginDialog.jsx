import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Mail, Eye, EyeOff, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

const COLORS = [
  '#0d6efd','#6f42c1','#d63384','#dc3545',
  '#fd7e14','#198754','#20c997','#0dcaf0','#6c757d',
];

const STEPS = ['Email & Password', 'Server Settings', 'Done'];

export default function LoginDialog({ onClose }) {
  const { addAccount, showToast } = useApp();
  const api = window.electronAPI;

  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [avatarColor, setAvatarColor] = useState(COLORS[0]);
  const [discovering, setDiscovering] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | true | false
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState(993);
  const [imapSecure, setImapSecure] = useState(true);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(465);
  const [smtpSecure, setSmtpSecure] = useState(true);

  const handleDiscover = async () => {
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    setError('');
    setDiscovering(true);
    try {
      const res = await api.autoDiscover(email.trim());
      if (res.success) {
        setImapHost(res.imap_host);
        setImapPort(res.imap_port);
        setImapSecure(res.imap_secure);
        setSmtpHost(res.smtp_host);
        setSmtpPort(res.smtp_port);
        setSmtpSecure(res.smtp_secure);
        setStep(1);
      } else {
        // Auto-discover failed — still proceed to manual step
        setStep(1);
      }
    } finally {
      setDiscovering(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testConnection({
        email,
        password,
        imap_host: imapHost,
        imap_port: Number(imapPort),
        imap_secure: imapSecure,
        smtp_host: smtpHost,
        smtp_port: Number(smtpPort),
        smtp_secure: smtpSecure,
      });
      setTestResult(res.success);
      if (!res.success) setError(res.error || 'Connection test failed.');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!testResult) { setError('Please test the connection before saving.'); return; }
    setSaving(true);
    try {
      await addAccount({
        name: name || email.split('@')[0],
        email: email.trim(),
        password,
        imap_host: imapHost,
        imap_port: Number(imapPort),
        imap_secure: imapSecure ? 1 : 0,
        smtp_host: smtpHost,
        smtp_port: Number(smtpPort),
        smtp_secure: smtpSecure ? 1 : 0,
        avatar_color: avatarColor,
      });
      setStep(2);
    } catch (err) {
      setError(err.message || 'Failed to save account.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.6)', zIndex: 10000 }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h5 className="modal-title d-flex align-items-center gap-2">
              <Mail size={18} /> Add Account
            </h5>
            <button className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            {/* Step indicator */}
            <div className="d-flex align-items-center mb-4">
              {STEPS.map((s, i) => (
                <React.Fragment key={s}>
                  <div className={`step-dot rounded-circle d-flex align-items-center justify-content-center fw-bold`}
                    style={{
                      width: 28, height: 28, fontSize: 12, flexShrink: 0,
                      background: i <= step ? '#0d6efd' : '#343a40',
                      color: i <= step ? '#fff' : '#6c757d',
                    }}>
                    {i + 1}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="flex-grow-1 border-top mx-1" style={{ borderColor: i < step ? '#0d6efd' : '#343a40', borderWidth: 2 }} />
                  )}
                </React.Fragment>
              ))}
            </div>

            {error && <div className="alert alert-danger py-2 mb-3" style={{ fontSize: 13 }}>{error}</div>}

            {/* Step 0 — Email & Password */}
            {step === 0 && (
              <div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Display Name</label>
                  <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Email Address</label>
                  <input className="form-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Password / App Password</label>
                  <div className="input-group">
                    <input
                      className="form-control"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                    <button className="btn btn-outline-secondary" type="button" onClick={() => setShowPassword((v) => !v)}>
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label fw-semibold">Avatar Color</label>
                  <div className="d-flex gap-2">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="rounded-circle border-0"
                        style={{
                          width: 24, height: 24, background: c,
                          outline: avatarColor === c ? '3px solid white' : 'none',
                          outlineOffset: 2,
                        }}
                        onClick={() => setAvatarColor(c)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 1 — Server Settings */}
            {step === 1 && (
              <div>
                <p className="text-secondary mb-3" style={{ fontSize: 13 }}>
                  We auto-detected settings below. Verify them, then test the connection.
                </p>
                <div className="row g-2 mb-3">
                  <div className="col-7">
                    <label className="form-label fw-semibold" style={{ fontSize: 12 }}>IMAP Host</label>
                    <input className="form-control form-control-sm" value={imapHost} onChange={(e) => setImapHost(e.target.value)} />
                  </div>
                  <div className="col-3">
                    <label className="form-label fw-semibold" style={{ fontSize: 12 }}>Port</label>
                    <input className="form-control form-control-sm" type="number" value={imapPort} onChange={(e) => setImapPort(e.target.value)} />
                  </div>
                  <div className="col-2 d-flex align-items-end pb-1">
                    <div className="form-check form-switch mb-0">
                      <input className="form-check-input" type="checkbox" checked={imapSecure} onChange={(e) => setImapSecure(e.target.checked)} id="imapSsl" />
                      <label className="form-check-label" htmlFor="imapSsl" style={{ fontSize: 11 }}>SSL</label>
                    </div>
                  </div>
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-7">
                    <label className="form-label fw-semibold" style={{ fontSize: 12 }}>SMTP Host</label>
                    <input className="form-control form-control-sm" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
                  </div>
                  <div className="col-3">
                    <label className="form-label fw-semibold" style={{ fontSize: 12 }}>Port</label>
                    <input className="form-control form-control-sm" type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} />
                  </div>
                  <div className="col-2 d-flex align-items-end pb-1">
                    <div className="form-check form-switch mb-0">
                      <input className="form-check-input" type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} id="smtpSsl" />
                      <label className="form-check-label" htmlFor="smtpSsl" style={{ fontSize: 11 }}>SSL</label>
                    </div>
                  </div>
                </div>

                {/* Test result */}
                {testResult === true && (
                  <div className="alert alert-success py-2 d-flex align-items-center gap-2" style={{ fontSize: 13 }}>
                    <CheckCircle size={14} /> Connection successful!
                  </div>
                )}
                {testResult === false && (
                  <div className="alert alert-danger py-2 d-flex align-items-center gap-2" style={{ fontSize: 13 }}>
                    <XCircle size={14} /> {error || 'Connection failed.'}
                  </div>
                )}
              </div>
            )}

            {/* Step 2 — Done */}
            {step === 2 && (
              <div className="text-center py-3">
                <div style={{ fontSize: 56 }}>🎉</div>
                <h5 className="mt-2">Account Added!</h5>
                <p className="text-secondary" style={{ fontSize: 13 }}>
                  <strong>{name || email}</strong> is now set up and syncing in the background.
                </p>
              </div>
            )}
          </div>

          <div className="modal-footer">
            {step === 0 && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleDiscover}
                  disabled={discovering || !email || !password}
                >
                  {discovering ? <><RefreshCw size={13} className="spin me-1" />Detecting…</> : 'Next →'}
                </button>
              </>
            )}
            {step === 1 && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => { setStep(0); setTestResult(null); }}>← Back</button>
                <button
                  className="btn btn-outline-info btn-sm"
                  onClick={handleTest}
                  disabled={testing || !imapHost || !smtpHost}
                >
                  {testing ? <><RefreshCw size={13} className="spin me-1" />Testing…</> : 'Test Connection'}
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSave}
                  disabled={saving || !testResult}
                >
                  {saving ? 'Saving…' : 'Save Account'}
                </button>
              </>
            )}
            {step === 2 && (
              <button className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
