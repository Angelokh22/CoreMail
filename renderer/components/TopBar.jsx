import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import AccountDropdown from './AccountDropdown';
import { RefreshCw, PenSquare, Settings, Search } from 'lucide-react';

export default function TopBar({ onCompose, onAddAccount, onSettings }) {
  const { selectedAccount, syncCurrentAccount, loading, accounts } = useApp();
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <nav className="topbar navbar px-3 d-flex align-items-center gap-2">
      {/* App title */}
      <span className="navbar-brand fw-bold text-primary mb-0 me-2">
        <span className="cm-logo">✉</span> CoreMail
      </span>

      {/* Account selector dropdown */}
      <AccountDropdown onAddAccount={onAddAccount} />

      {/* Search */}
      <div className="flex-grow-1 px-2">
        <div className="input-group input-group-sm">
          <span className="input-group-text bg-transparent border-secondary">
            <Search size={14} />
          </span>
          <input
            type="text"
            className="form-control bg-transparent border-secondary text-light"
            placeholder="Search emails…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="d-flex gap-2">
        <button
          className="btn btn-sm btn-primary d-flex align-items-center gap-1"
          onClick={onCompose}
          title="Compose"
        >
          <PenSquare size={14} />
          <span className="d-none d-md-inline">Compose</span>
        </button>

        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={syncCurrentAccount}
          disabled={loading || !selectedAccount}
          title="Sync"
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
        </button>

        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={onSettings}
          title="Settings"
        >
          <Settings size={14} />
        </button>
      </div>
    </nav>
  );
}
