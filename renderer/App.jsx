import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import MailList from './components/MailList';
import MailViewer from './components/MailViewer';
import ComposeDialog from './components/ComposeDialog';
import LoginDialog from './components/LoginDialog';
import SettingsDialog from './components/SettingsDialog';
import ToastNotification from './components/ToastNotification';

function Shell() {
  const { toast } = useApp();
  const [showCompose, setShowCompose] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="app-shell d-flex flex-column vh-100 overflow-hidden">
      {/* Top navigation bar */}
      <TopBar
        onCompose={() => setShowCompose(true)}
        onAddAccount={() => setShowLogin(true)}
        onSettings={() => setShowSettings(true)}
      />

      {/* Main 3-pane layout */}
      <div className="d-flex flex-grow-1 overflow-hidden">
        <Sidebar />
        <MailList />
        <MailViewer />
      </div>

      {/* Modals */}
      {showCompose && <ComposeDialog onClose={() => setShowCompose(false)} />}
      {showLogin && <LoginDialog onClose={() => setShowLogin(false)} />}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}

      {/* Toast notifications */}
      {toast && <ToastNotification toast={toast} />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
