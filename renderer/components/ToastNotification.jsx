import React from 'react';

export default function ToastNotification({ toast }) {
  return (
    <div
      className="position-fixed bottom-0 end-0 p-3"
      style={{ zIndex: 11000 }}
    >
      <div
        className={`toast show align-items-center text-bg-${toast.variant || 'primary'} border-0`}
        role="alert"
        aria-live="assertive"
      >
        <div className="d-flex">
          <div className="toast-body">
            <div className="fw-semibold mb-1" style={{ fontSize: 13 }}>{toast.title}</div>
            <div style={{ fontSize: 12, opacity: 0.9 }}>{toast.body}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
