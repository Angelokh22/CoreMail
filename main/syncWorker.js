/**
 * syncWorker.js
 * 
 * Maintains persistent IMAP IDLE connections for all active accounts
 * simultaneously. Fires events to the main process when new mail arrives,
 * so the UI can be updated and Windows notifications can be shown — even
 * while the user is viewing a different account.
 */

const { ImapFlow } = require('imapflow');
const EventEmitter = require('events');

class SyncWorker extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<number, { client: ImapFlow, timer: NodeJS.Timer | null }>} */
    this.connections = new Map();
    this.running = false;
  }

  /**
   * Start monitoring a single account with IMAP IDLE.
   * @param {Object} account - DB account record
   */
  async startAccount(account) {
    if (!account || !account.id) {
      console.warn('[SyncWorker] startAccount called with invalid account:', account);
      return;
    }
    if (this.connections.has(account.id)) {
      await this.stopAccount(account.id);
    }

    const client = new ImapFlow({
      host: account.imap_host,
      port: account.imap_port,
      secure: account.imap_secure === 1 || account.imap_secure === true,
      auth: { user: account.email, pass: account.password },
      logger: false,
      tls: { rejectUnauthorized: false },
    });

    const entry = { client, timer: null, account };
    this.connections.set(account.id, entry);

    client.on('exists', (data) => {
      this.emit('new-mail', { accountId: account.id, account, data });
    });

    client.on('expunge', (data) => {
      this.emit('mail-deleted', { accountId: account.id, data });
    });

    client.on('flags', (data) => {
      this.emit('mail-flags-changed', { accountId: account.id, data });
    });

    client.on('close', () => {
      const conn = this.connections.get(account.id);
      if (conn && this.running) {
        // Reconnect after 10 seconds on unexpected disconnect
        conn.timer = setTimeout(() => this._reconnect(account), 10000);
      }
    });

    try {
      await client.connect();
      await client.mailboxOpen('INBOX');
      // Start IDLE — keeps connection alive and receives server pushes
      await client.idle();
    } catch (err) {
      console.error(`[SyncWorker] Failed to connect account ${account.email}:`, err.message);
      entry.timer = setTimeout(() => this._reconnect(account), 30000);
    }
  }

  async _reconnect(account) {
    if (!this.running) return;
    console.log(`[SyncWorker] Reconnecting ${account.email}…`);
    try {
      await this.startAccount(account);
    } catch (err) {
      console.error(`[SyncWorker] Reconnect failed for ${account.email}:`, err.message);
    }
  }

  async stopAccount(accountId) {
    const entry = this.connections.get(accountId);
    if (!entry) return;
    
    // Delete first so 'close' event handler ignores it
    this.connections.delete(accountId);
    if (entry.timer) clearTimeout(entry.timer);
    
    try {
      await entry.client.logout();
    } catch (_) {}
  }

  /**
   * Start syncing all provided accounts.
   * @param {Object[]} accounts - Array of account records from DB
   */
  async startAll(accounts) {
    this.running = true;
    for (const account of accounts) {
      if (!this.running) break;
      await this.startAccount(account).catch((err) =>
        console.error(`[SyncWorker] startAccount error:`, err)
      );
      // Wait 1 second between logins to prevent server rate limiting
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  /**
   * Stop all connections.
   */
  async stopAll() {
    this.running = false;
    const ids = [...this.connections.keys()];
    for (const id of ids) {
      await this.stopAccount(id);
    }
  }

  /**
   * Refresh account list (add new, remove deleted).
   */
  async refresh(accounts) {
    const newIds = new Set(accounts.map((a) => a.id));
    // Remove accounts that no longer exist
    for (const id of this.connections.keys()) {
      if (!newIds.has(id)) await this.stopAccount(id);
    }
    // Add new accounts
    for (const account of accounts) {
      if (!this.connections.has(account.id)) {
        await this.startAccount(account).catch(console.error);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  getStatus() {
    const status = {};
    for (const [id, entry] of this.connections) {
      status[id] = {
        email: entry.account.email,
        connected: entry.client.usable,
      };
    }
    return status;
  }
}

module.exports = new SyncWorker();
