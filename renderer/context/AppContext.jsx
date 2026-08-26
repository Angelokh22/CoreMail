import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // ── Core state ────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState([]);
  const [folders, setFolders] = useState([]);
  const [settings, setSettingsState] = useState({});
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedMailbox, setSelectedMailbox] = useState('INBOX');
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [mailboxes, setMailboxes] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState({});
  const [toast, setToast] = useState(null); // { title, body, variant }

  const api = window.electronAPI;

  const applyTheme = useCallback((theme) => {
    let actualTheme = theme || 'dark';
    if (actualTheme === 'system') {
      actualTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-bs-theme', actualTheme);
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (settings.theme === 'system') {
        applyTheme('system');
      }
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [settings.theme, applyTheme]);

  // ── Initial load ──────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.getAccounts(),
      api.getFolders(),
      api.getSettings(),
    ]).then(([accs, flds, sets]) => {
      setAccounts(accs);
      setFolders(flds);
      setSettingsState(sets);
      // Apply theme from settings
      applyTheme(sets.theme);
      
      if (accs.length > 0) {
        // Restore last opened account or default to first
        const lastAcc = accs.find(a => a.id === sets.last_account_id);
        setSelectedAccount(lastAcc || accs[0]);
        if (sets.last_mailbox) {
          setSelectedMailbox(sets.last_mailbox);
        }
      }
    });
  }, [api, applyTheme]);

  // ── Load emails when account/mailbox changes ──────────────────────
  useEffect(() => {
    if (!selectedAccount) return;
    loadEmails();
    loadMailboxes();
    
    // Save to settings
    api.setSetting('last_account_id', selectedAccount.id);
    api.setSetting('last_mailbox', selectedMailbox);
  }, [selectedAccount, selectedMailbox]);

  const refreshLocalEmails = useCallback(async () => {
    if (!selectedAccount) return;
    const cached = await api.getEmails(selectedAccount.id, selectedMailbox, 5000);
    setEmails(cached);
  }, [selectedAccount, selectedMailbox, api]);

  const loadEmails = useCallback(async () => {
    if (!selectedAccount) return;
    setLoading(true);
    try {
      // First read from local cache for instant UI
      await refreshLocalEmails();

      // Always sync the first 100 from the server in the background to catch missed emails
      const syncResult = await api.syncAccount(selectedAccount.id, selectedMailbox, 100, 0);
      if (syncResult.success && syncResult.count > 0) {
        await refreshLocalEmails();
      }
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, selectedMailbox, api, refreshLocalEmails]);

  const loadMoreEmails = async () => {
    if (!selectedAccount) return;
    setLoading(true);
    try {
      // The offset is simply the number of emails we currently have in cache for this mailbox
      const offset = emails.length;
      const syncResult = await api.syncAccount(selectedAccount.id, selectedMailbox, 100, offset);
      if (syncResult.success && syncResult.count > 0) {
        await refreshLocalEmails();
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMailboxes = useCallback(async () => {
    if (!selectedAccount) return;
    const result = await api.getMailboxes(selectedAccount.id);
    setMailboxes(result);
  }, [selectedAccount]);

  // ── Subscriptions ───────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedAccount) return;

    const unsubNewMail = api.onNewMail(({ accountId, email }) => {
      if (accountId === selectedAccount.id && email.mailbox === selectedMailbox) {
        setEmails((prev) => [email, ...prev]);
      }
      showToast(
        `New mail — ${accounts.find((a) => a.id === accountId)?.name || 'Account'}`,
        `${email.from_name || email.from_email}: ${email.subject}`,
        'primary'
      );
    });

    const unsubCounts = api.onUnreadCounts((counts) => setUnreadCounts(counts));

    // When a background initial sync finishes for the active account, reload
    const unsubSyncStatus = api.onSyncStatus(({ accountId, done }) => {
      if (done && selectedAccount?.id === accountId) {
        refreshLocalEmails();
      }
    });

    const unsubSyncProgress = api.onSyncProgress(({ accountId, mailbox, fetchedCount, totalCount }) => {
      if (accountId === selectedAccount.id && mailbox === selectedMailbox) {
        refreshLocalEmails(); // live update the list
        showToast('Syncing emails...', `Downloaded ${fetchedCount} of ${totalCount}`, 'info');
      }
    });

    return () => {
      unsubNewMail?.();
      unsubCounts?.();
      unsubSyncStatus?.();
      unsubSyncProgress?.();
    };
  }, [selectedAccount, selectedMailbox, accounts, refreshLocalEmails, api]);

  // ── Toast helper ──────────────────────────────────────────────────
  const showToast = (title, body, variant = 'primary') => {
    setToast({ title, body, variant });
    setTimeout(() => setToast(null), 5000);
  };

  // ── Actions ───────────────────────────────────────────────────────
  const addAccount = async (data) => {
    const acc = await api.addAccount(data);
    if (!acc || acc.error) throw new Error(acc?.error || 'Failed to add account');
    setAccounts((prev) => [...prev, acc]);
    setSelectedAccount(acc);
    return acc;
  };

  const updateAccount = async (id, data) => {
    const updated = await api.updateAccount(id, data);
    setAccounts((prev) => prev.map((a) => (a.id === id ? updated : a)));
    if (selectedAccount?.id === id) {
      setSelectedAccount(updated);
    }
    return updated;
  };

  const deleteAccount = async (id) => {
    await api.deleteAccount(id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    if (selectedAccount?.id === id) {
      const remaining = accounts.filter((a) => a.id !== id);
      setSelectedAccount(remaining[0] || null);
    }
    // Also refresh folders (accounts may have been removed from them)
    const flds = await api.getFolders();
    setFolders(flds);
  };

  const createFolder = async (name, color, accountIds) => {
    const flds = await api.createFolder(name, color, accountIds);
    setFolders(flds);
  };

  const updateFolder = async (id, name, color, accountIds) => {
    const flds = await api.updateFolder(id, name, color, accountIds);
    setFolders(flds);
  };

  const deleteFolder = async (id) => {
    const flds = await api.deleteFolder(id);
    setFolders(flds);
  };

  const syncCurrentAccount = async () => {
    if (!selectedAccount) return;
    setLoading(true);
    try {
      const result = await api.syncAccount(selectedAccount.id, selectedMailbox);
      if (result.success) {
        await loadEmails();
        showToast('Sync complete', `Fetched ${result.count} emails.`, 'success');
      } else {
        showToast('Sync failed', result.error, 'danger');
      }
    } finally {
      setLoading(false);
    }
  };

  const selectEmail = async (email) => {
    setSelectedEmail(email);
    if (!email.is_read) {
      await api.markRead(email.id, true);
      setEmails((prev) =>
        prev.map((e) => (e.id === email.id ? { ...e, is_read: 1 } : e))
      );
    }
  };

  const deleteEmail = async (emailId) => {
    await api.deleteEmail(emailId);
    setEmails((prev) => prev.filter((e) => e.id !== emailId));
    if (selectedEmail?.id === emailId) setSelectedEmail(null);
  };

  const toggleStar = async (email) => {
    const newVal = email.is_starred ? 0 : 1;
    await api.markStarred(email.id, newVal === 1);
    setEmails((prev) =>
      prev.map((e) => (e.id === email.id ? { ...e, is_starred: newVal } : e))
    );
  };

  const saveSetting = async (key, value) => {
    await api.setSetting(key, value);
    setSettingsState((prev) => ({ ...prev, [key]: value }));
    if (key === 'theme') {
      applyTheme(value);
    }
  };

  const value = {
    accounts,
    folders,
    settings,
    selectedAccount,
    setSelectedAccount,
    selectedMailbox,
    setSelectedMailbox,
    emails,
    setEmails,
    selectedEmail,
    setSelectedEmail,
    mailboxes,
    unreadCounts,
    loading,
    syncStatus,
    toast,
    showToast,
    // actions
    addAccount,
    updateAccount,
    deleteAccount,
    createFolder,
    updateFolder,
    deleteFolder,
    syncCurrentAccount,
    selectEmail,
    deleteEmail,
    toggleStar,
    saveSetting,
    loadEmails,
    loadMoreEmails,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
