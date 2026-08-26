/**
 * preload.js
 * 
 * Exposes a secure, typed API surface to the renderer process via
 * contextBridge. The renderer never gets direct access to Node.js
 * internals — only these explicit IPC channels.
 */
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const on = (channel, cb) => {
  const sub = (_event, ...args) => cb(...args);
  ipcRenderer.on(channel, sub);
  return () => ipcRenderer.removeListener(channel, sub);
};

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Accounts ──────────────────────────────────────────────────────
  getAccounts: () => invoke('accounts:getAll'),
  addAccount: (data) => invoke('accounts:add', data),
  updateAccount: (id, data) => invoke('accounts:update', id, data),
  deleteAccount: (id) => invoke('accounts:delete', id),
  testConnection: (data) => invoke('accounts:test', data),
  autoDiscover: (email) => invoke('accounts:autoDiscover', email),

  // ── Folders ───────────────────────────────────────────────────────
  getFolders: () => invoke('folders:getAll'),
  createFolder: (name, color, accountIds) => invoke('folders:create', name, color, accountIds),
  updateFolder: (id, name, color, accountIds) => invoke('folders:update', id, name, color, accountIds),
  deleteFolder: (id) => invoke('folders:delete', id),

  // ── Emails ────────────────────────────────────────────────────────
  getEmails: (accountId, mailbox, limit) => invoke('emails:get', accountId, mailbox, limit),
  getUnifiedInbox: (limit) => invoke('emails:getUnified', limit),
  getSnoozed: () => invoke('emails:getSnoozed'),
  searchEmails: (query, accountId) => invoke('emails:search', query, accountId),
  getEmailBody: (accountId, mailbox, uid) => invoke('emails:getBody', accountId, mailbox, uid),
  syncAccount: (accountId, mailbox, limit, offset) => invoke('emails:sync', accountId, mailbox, limit, offset),
  markRead: (emailId, isRead) => invoke('emails:markRead', emailId, isRead),
  markStarred: (emailId, isStarred) => invoke('emails:markStarred', emailId, isStarred),
  snoozeEmail: (emailId, until) => invoke('emails:snooze', emailId, until),
  deleteEmail: (emailId) => invoke('emails:delete', emailId),
  downloadAttachment: (accountId, mailbox, uid, filename) => invoke('emails:downloadAttachment', accountId, mailbox, uid, filename),
  moveEmail: (emailId, destMailbox) => invoke('emails:move', emailId, destMailbox),
  sendEmail: (accountId, mailOptions) => invoke('emails:send', accountId, mailOptions),
  getMailboxes: (accountId) => invoke('emails:getMailboxes', accountId),

  // ── Settings ──────────────────────────────────────────────────────
  getSettings: () => invoke('settings:getAll'),
  setSetting: (key, value) => invoke('settings:set', key, value),

  // ── Recipient Groups ──────────────────────────────────────────────
  getGroups: () => invoke('groups:getAll'),
  createGroup: (name, members) => invoke('groups:create', name, members),
  updateGroup: (id, name, members) => invoke('groups:update', id, name, members),
  deleteGroup: (id) => invoke('groups:delete', id),

  // ── Push events (main → renderer) ─────────────────────────────────
  onNewMail: (cb) => on('push:new-mail', cb),
  onMailDeleted: (cb) => on('push:mail-deleted', cb),
  onSyncStatus: (cb) => on('push:sync-status', cb),
  onSyncProgress: (cb) => on('push:sync-progress', cb),
  onUnreadCounts: (cb) => on('push:unread-counts', cb),
  onNotificationClicked: (cb) => on('push:notification-clicked', cb),

  // ── Utility ───────────────────────────────────────────────────────
  openExternal: (url) => invoke('shell:openExternal', url),
  getSyncStatus: () => invoke('sync:status'),
  platform: process.platform,
});
