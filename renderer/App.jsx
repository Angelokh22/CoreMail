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
  const [composeInitialData, setComposeInitialData] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  React.useEffect(() => {
    return window.electronAPI.onComposeMailto((url) => {
      try {
        // Parse mailto: url
        // Format: mailto:someone@example.com?subject=Hello&cc=cc@example.com
        const parsed = new URL(url);
        const to = parsed.pathname ? [parsed.pathname] : [];
        const cc = parsed.searchParams.get('cc') ? parsed.searchParams.get('cc').split(',') : [];
        const bcc = parsed.searchParams.get('bcc') ? parsed.searchParams.get('bcc').split(',') : [];
        const subject = parsed.searchParams.get('subject') || '';
        const body = parsed.searchParams.get('body') || '';

        setComposeInitialData({ to, cc, bcc, subject, body });
        setShowCompose(true);
      } catch (err) {
        console.error('Failed to parse mailto URL:', err);
      }
    });
  }, []);

  return (
    <div className="app-shell d-flex flex-column vh-100 overflow-hidden">
      {/* Top navigation bar */}
      <TopBar
        onCompose={() => { setComposeInitialData(null); setShowCompose(true); }}
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
      {showCompose && <ComposeDialog onClose={() => { setShowCompose(false); setComposeInitialData(null); }} initialData={composeInitialData} />}
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
