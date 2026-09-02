import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // ── Core state ────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState([]);
  const [folders, setFolders] = useState([]);
  const [groups, setGroups] = useState([]);
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
  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Starred filter
  const [showStarred, setShowStarred] = useState(false);

  const loadGenerationRef = useRef(0);

  const api = window.electronAPI;

  const applyTheme = useCallback((theme) => {
    let actualTheme = theme || 'dark';
    if (actualTheme === 'system') {
      actualTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-bs-theme', actualTheme);
  }, []);

  const applyFontSize = useCallback((size) => {
    const map = { small: '13px', medium: '15px', large: '17px' };
    document.documentElement.style.fontSize = map[size] || '15px';
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
      api.getGroups(),
    ]).then(([accs, flds, sets, grps]) => {
      setAccounts(accs);
      setFolders(flds);
      setSettingsState(sets);
      setGroups(grps);
      // Apply theme and font size from settings
      applyTheme(sets.theme);
      applyFontSize(sets.font_size);
      
      if (accs.length > 0) {
        // Restore last opened account or default to first
        const lastAcc = accs.find(a => a.id === Number(sets.last_account_id));
        setSelectedAccount(lastAcc || accs[0]);
        const lastMailbox = sets.last_mailbox || (sets.unified_inbox !== 'false' ? '__unified__' : 'INBOX');
        setSelectedMailbox(lastMailbox);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load emails when account/mailbox changes ──────────────────────
  useEffect(() => {
    if (!selectedAccount) return;
    loadEmails();
    loadMailboxes();
    
    // Save to settings
    api.setSetting('last_account_id', selectedAccount.id);
    api.setSetting('last_mailbox', selectedMailbox);
  }, [selectedAccount, selectedMailbox]); // eslint-disable-line react-hooks/exhaustive-deps

  const isUnifiedMode = useCallback((mailbox, sets) => {
    const s = sets || settings;
    return s.unified_inbox === 'true' && mailbox === 'INBOX';
  }, [settings]);

  const refreshLocalEmails = useCallback(async () => {
    if (!selectedAccount) return;
    if (selectedMailbox === '__snoozed__') {
      const snoozed = await api.getSnoozed();
      setEmails(snoozed);
      return;
    }
    if (selectedMailbox === '__unified__') {
      const unified = await api.getUnifiedInbox(5000);
      setEmails(unified);
      return;
    }
    const cached = await api.getEmails(selectedAccount.id, selectedMailbox, 5000);
    setEmails(cached);
  }, [selectedAccount, selectedMailbox, api]);

  const loadEmails = useCallback(async () => {
    if (!selectedAccount) return;
    setLoading(true);
    const currentGeneration = ++loadGenerationRef.current;
    
    try {
      await refreshLocalEmails();
      if (currentGeneration !== loadGenerationRef.current) return;

      if (selectedMailbox === '__snoozed__' || selectedMailbox === '__unified__') return;

      const syncResult = await api.syncAccount(selectedAccount.id, selectedMailbox, 100, 0);
      if (syncResult.success && syncResult.count > 0 && currentGeneration === loadGenerationRef.current) {
        await refreshLocalEmails();
      }
    } finally {
      if (currentGeneration === loadGenerationRef.current) setLoading(false);
    }
  }, [selectedAccount, selectedMailbox, api, refreshLocalEmails]);

  const loadMoreEmails = useCallback(async () => {
    if (!selectedAccount || selectedMailbox === '__snoozed__' || selectedMailbox === '__unified__') return;
    setLoading(true);
    try {
      // Use emails state directly via closure since we'll wrap it in useCallback, but we need
      // the latest emails. Actually, it's better to use a functional updater or a ref, but
      // useCallback with emails in deps is fine for this.
      const minUid = emails.length > 0 ? Math.min(...emails.map(e => e.uid)) : null;
      const syncResult = await api.syncAccount(selectedAccount.id, selectedMailbox, 100, minUid);
      if (syncResult.success && syncResult.count > 0) {
        await refreshLocalEmails();
      }
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, selectedMailbox, emails, api, refreshLocalEmails]);

  const loadMailboxes = useCallback(async () => {
    if (!selectedAccount) return;
    const result = await api.getMailboxes(selectedAccount.id);
    setMailboxes(result);
  }, [selectedAccount]);

  // ── Search ──────────────────────────────────────────────────────────
  const searchDebounceRef = useRef(null);

  const handleSearchChange = useCallback((query) => {
    setSearchQuery(query);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const accountId = settings.unified_inbox === 'true' ? null : selectedAccount?.id;
        const results = await api.searchEmails(query.trim(), accountId);
        setSearchResults(results);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, [selectedAccount, settings.unified_inbox, api]);

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
  const toastTimerRef = useRef(null);
  const showToast = useCallback((title, body, variant = 'primary') => {
    setToast({ title, body, variant });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
  }, []);

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
    setAccounts((prev) => {
      const remaining = prev.filter((a) => a.id !== id);
      if (selectedAccount?.id === id) {
        setSelectedAccount(remaining[0] || null);
      }
      return remaining;
    });
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

  // ── Group actions ─────────────────────────────────────────────────
  const loadGroups = useCallback(async () => {
    const grps = await api.getGroups();
    setGroups(grps);
  }, [api]);

  const createGroup = async (name, members) => {
    await api.createGroup(name, members);
    await loadGroups();
  };

  const updateGroup = async (id, name, members) => {
    await api.updateGroup(id, name, members);
    await loadGroups();
  };

  const deleteGroup = async (id) => {
    await api.deleteGroup(id);
    await loadGroups();
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
    if (selectedEmail?.id === email.id) {
      setSelectedEmail((prev) => ({ ...prev, is_starred: newVal }));
    }
  };

  const markUnread = async (emailId) => {
    await api.markRead(emailId, false);
    setEmails((prev) =>
      prev.map((e) => (e.id === emailId ? { ...e, is_read: 0 } : e))
    );
    if (selectedEmail?.id === emailId) {
      setSelectedEmail(null);
    }
  };

  const snoozeEmail = async (emailId, until) => {
    await api.snoozeEmail(emailId, until);
    setEmails((prev) => prev.filter((e) => e.id !== emailId));
    if (selectedEmail?.id === emailId) setSelectedEmail(null);
    showToast('Email snoozed', `Will reappear ${new Date(until).toLocaleString()}`, 'info');
  };

  const saveSetting = async (key, value) => {
    await api.setSetting(key, value);
    setSettingsState((prev) => ({ ...prev, [key]: value }));
    if (key === 'theme') applyTheme(value);
    if (key === 'font_size') applyFontSize(value);
    if (key === 'unified_inbox') {
      // Reload email list immediately when toggling unified inbox
      setTimeout(() => refreshLocalEmails(), 50);
    }
  };

  const value = {
    accounts,
    folders,
    groups,
    settings,
    selectedAccount,
    setSelectedAccount,
    selectedMailbox,
    setSelectedMailbox,
    showStarred,
    setShowStarred,
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
    // search
    searchQuery,
    searchResults,
    isSearching,
    handleSearchChange,
    // actions
    addAccount,
    updateAccount,
    deleteAccount,
    createFolder,
    updateFolder,
    deleteFolder,
    createGroup,
    updateGroup,
    deleteGroup,
    loadGroups,
    syncCurrentAccount,
    selectEmail,
    deleteEmail,
    toggleStar,
    markUnread,
    snoozeEmail,
    saveSetting,
    loadEmails,
    loadMoreEmails,
    refreshLocalEmails,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
