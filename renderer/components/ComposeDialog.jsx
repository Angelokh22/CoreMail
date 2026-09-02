import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { X, Paperclip, Send, Users, ChevronDown } from 'lucide-react';

function EmailChipInput({ value, onChange, placeholder, groups = [] }) {
  const [input, setInput] = useState('');
  const [showGroups, setShowGroups] = useState(false);
  const groupsRef = useRef(null);

  const addChip = (e) => {
    // If blurring to a group button or something, don't add the current half-typed text if they were just navigating.
    // We'll allow it if e is undefined (from Enter) or if relatedTarget is not part of this component.
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput('');
  };

  const addGroup = (group) => {
    const newEmails = group.members.filter((m) => !value.includes(m));
    if (newEmails.length > 0) onChange([...value, ...newEmails]);
    setShowGroups(false);
  };

  const removeChip = (chip) => onChange(value.filter((c) => c !== chip));

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      addChip();
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      removeChip(value[value.length - 1]);
    }
  };

  // Close groups dropdown on outside click
  useEffect(() => {
    if (!showGroups) return;
    const handler = (e) => { if (groupsRef.current && !groupsRef.current.contains(e.target)) setShowGroups(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showGroups]);

  return (
    <div className="d-flex gap-1">
      <div className="chip-input flex-grow-1 d-flex flex-wrap gap-1 p-1 border rounded border-secondary bg-transparent">
        {value.map((chip) => (
          <span
            key={chip}
            className="badge bg-primary d-flex align-items-center gap-1"
            style={{ fontSize: 12 }}
          >
            {chip}
            <button
              type="button"
              className="btn-close btn-close-white"
              style={{ fontSize: 8 }}
              onClick={() => removeChip(chip)}
            />
          </span>
        ))}
        <input
          type="email"
          className="flex-grow-1 bg-transparent border-0 text-light"
          style={{ minWidth: 120, outline: 'none', fontSize: 13 }}
          placeholder={value.length === 0 ? placeholder : ''}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={(e) => {
            // Ignore blur if we clicked a group button
            if (e.relatedTarget && groupsRef.current?.contains(e.relatedTarget)) return;
            addChip();
          }}
        />
      </div>

      {/* Groups picker button */}
      {groups.length > 0 && (
        <div className="position-relative" ref={groupsRef}>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
            title="Add recipient group"
            onClick={() => setShowGroups((v) => !v)}
          >
            <Users size={12} />
            <ChevronDown size={10} />
          </button>
          {showGroups && (
            <div className="dropdown-menu show" style={{ right: 0, left: 'auto', zIndex: 10001, minWidth: 180, maxHeight: 200, overflowY: 'auto' }}>
              {groups.map((g) => (
                <button
                  key={g.id}
                  className="dropdown-item"
                  style={{ fontSize: 12 }}
                  onClick={() => addGroup(g)}
                >
                  <Users size={11} className="me-2" />
                  {g.name}
                  <span className="text-secondary ms-1" style={{ fontSize: 10 }}>
                    ({g.members.length})
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Simple HTML escaper
function escapeHtml(unsafe) {
  return (unsafe || '').replace(/[&<"']/g, function(m) {
    switch (m) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#039;';
      default: return m;
    }
  });
}

export default function ComposeDialog({ onClose, mode = 'new', originalEmail, initialData = null }) {
  const { accounts, selectedAccount, showToast, groups } = useApp();
  const api = window.electronAPI;

  const [fromAccountId, setFromAccountId] = useState(selectedAccount?.id || accounts[0]?.id);
  const [to, setTo] = useState([]);
  const [cc, setCc] = useState([]);
  const [bcc, setBcc] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [readReceipt, setReadReceipt] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!fromAccountId && accounts.length > 0) {
      setFromAccountId(selectedAccount?.id || accounts[0]?.id);
    }
  }, [accounts, selectedAccount, fromAccountId]);

  useEffect(() => {
    if (initialData && mode === 'new') {
      if (initialData.to?.length) setTo(initialData.to);
      if (initialData.cc?.length) { setCc(initialData.cc); setShowCc(true); }
      if (initialData.bcc?.length) { setBcc(initialData.bcc); setShowBcc(true); }
      if (initialData.subject) setSubject(initialData.subject);
      if (initialData.body) setBody(initialData.body);
    }
    
    if (!originalEmail) return;
    if (mode === 'reply') {
      setTo([originalEmail.from_email].filter(Boolean));
      setSubject(
        originalEmail.subject?.startsWith('Re:')
          ? originalEmail.subject
          : `Re: ${originalEmail.subject}`
      );
      setBody(`\n\n---\nOn ${new Date(originalEmail.date).toLocaleString()}, ${originalEmail.from_name || originalEmail.from_email} wrote:\n${originalEmail.body_text?.slice(0, 2000) || ''}`);
    } else if (mode === 'forward') {
      setSubject(
        originalEmail.subject?.startsWith('Fwd:')
          ? originalEmail.subject
          : `Fwd: ${originalEmail.subject}`
      );
      setBody(`\n\n---\n---------- Forwarded message ----------\nFrom: ${originalEmail.from_email}\nDate: ${new Date(originalEmail.date).toLocaleString()}\nSubject: ${originalEmail.subject}\n\n${originalEmail.body_text || ''}`);
    }
  }, [mode, originalEmail, initialData]);

  const handleSend = async () => {
    if (to.length === 0) { showToast('Error', 'Please add at least one recipient.', 'danger'); return; }
    if (!subject.trim()) { showToast('Error', 'Please add a subject.', 'danger'); return; }

    setSending(true);
    try {
      const result = await api.sendEmail(fromAccountId, {
        to: to.join(', '),
        cc: cc.join(', ') || undefined,
        bcc: bcc.join(', ') || undefined,
        subject,
        text: body,
        html: `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(body)}</pre>`,
        readReceipt,
        attachments: attachments.map((f) => ({ path: f.path, filename: f.name })),
      });
      if (result.success) {
        showToast('Email sent', `Message delivered successfully.`, 'success');
        onClose();
      } else {
        showToast('Send failed', result.error || 'Unknown error', 'danger');
      }
    } finally {
      setSending(false);
    }
  };


  const handleAttachment = () => fileRef.current?.click();
  const onFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    setAttachments((prev) => [
      ...prev,
      ...files.map((f) => ({ name: f.name, path: f.path, size: f.size })),
    ]);
    e.target.value = '';
  };

  const removeAttachment = (index) =>
    setAttachments((prev) => prev.filter((_, i) => i !== index));

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 10000 }}>
      <div className="modal-dialog modal-lg modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header py-2">
            <h6 className="modal-title mb-0">
              {mode === 'reply' ? 'Reply' : mode === 'forward' ? 'Forward' : 'New Message'}
            </h6>
            <button className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body py-2">
            {/* From selector */}
            <div className="row g-2 mb-2 align-items-center">
              <label className="col-auto col-form-label" style={{ fontSize: 13, width: 50 }}>From</label>
              <div className="col">
                <select
                  className="form-select form-select-sm"
                  value={fromAccountId}
                  onChange={(e) => setFromAccountId(Number(e.target.value))}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} &lt;{a.email}&gt;
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-auto d-flex gap-2">
                <button type="button" className="btn btn-link btn-sm p-0 text-secondary" onClick={() => setShowCc((v) => !v)}>CC</button>
                <button type="button" className="btn btn-link btn-sm p-0 text-secondary" onClick={() => setShowBcc((v) => !v)}>BCC</button>
              </div>
            </div>

            {/* To */}
            <div className="row g-2 mb-2 align-items-center">
              <label className="col-auto col-form-label" style={{ fontSize: 13, width: 50 }}>To</label>
              <div className="col">
                <EmailChipInput value={to} onChange={setTo} placeholder="recipient@example.com" groups={groups} />
              </div>
            </div>

            {/* CC */}
            {showCc && (
              <div className="row g-2 mb-2 align-items-center">
                <label className="col-auto col-form-label" style={{ fontSize: 13, width: 50 }}>CC</label>
                <div className="col">
                  <EmailChipInput value={cc} onChange={setCc} placeholder="cc@example.com" groups={groups} />
                </div>
              </div>
            )}

            {/* BCC */}
            {showBcc && (
              <div className="row g-2 mb-2 align-items-center">
                <label className="col-auto col-form-label" style={{ fontSize: 13, width: 50 }}>BCC</label>
                <div className="col">
                  <EmailChipInput value={bcc} onChange={setBcc} placeholder="bcc@example.com" groups={groups} />
                </div>
              </div>
            )}

            {/* Subject */}
            <div className="row g-2 mb-2 align-items-center">
              <label className="col-auto col-form-label" style={{ fontSize: 13, width: 50 }}>Subj</label>
              <div className="col">
                <input
                  className="form-control form-control-sm"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                />
              </div>
            </div>

            {/* Body */}
            <textarea
              className="form-control mt-1"
              rows={12}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
            />

            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="mt-2 d-flex flex-wrap gap-2">
                {attachments.map((a, i) => (
                  <span
                    key={i}
                    className="badge bg-secondary d-flex align-items-center gap-1"
                    style={{ fontSize: 11 }}
                  >
                    <Paperclip size={10} />
                    {a.name}
                    <button
                      type="button"
                      className="btn-close btn-close-white ms-1"
                      style={{ fontSize: 8 }}
                      onClick={() => removeAttachment(i)}
                    />
                  </span>
                ))}
              </div>
            )}
          </div>


          <div className="modal-footer py-2 d-flex justify-content-between">
            <div className="d-flex align-items-center gap-3">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
                onClick={handleAttachment}
              >
                <Paperclip size={13} /> Attach
              </button>
              <input ref={fileRef} type="file" multiple className="d-none" onChange={onFileChange} />
              <div className="form-check form-switch mb-0">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="readReceipt"
                  checked={readReceipt}
                  onChange={(e) => setReadReceipt(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="readReceipt" style={{ fontSize: 12 }}>
                  Request read receipt
                </label>
              </div>
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-primary btn-sm d-flex align-items-center gap-1"
                onClick={handleSend}
                disabled={sending}
              >
                <Send size={13} />
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
