import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import AccountDropdown from './AccountDropdown';
import { RefreshCw, PenSquare, Settings, Search, X } from 'lucide-react';

export default function TopBar({ onCompose, onAddAccount, onSettings }) {
  const { selectedAccount, syncCurrentAccount, loading, accounts, handleSearchChange, searchQuery, isSearching } = useApp();
  const inputRef = useRef(null);

  const handleClear = () => {
    handleSearchChange('');
    inputRef.current?.focus();
  };

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
            {isSearching
              ? <RefreshCw size={14} className="spin" />
              : <Search size={14} />
            }
          </span>
          <input
            ref={inputRef}
            type="text"
            className="form-control bg-transparent border-secondary text-light"
            placeholder="Search emails…"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={handleClear}
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
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
