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

  async startAccount(account, retryCount = 0) {
    if (!this.running) this.running = true;
    if (this.stopping) return;
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

    const entry = { client, timer: null, account, lastKnownExists: 0 };
    this.connections.set(account.id, entry);

    client.on('exists', (data) => {
      const conn = this.connections.get(account.id);
      if (conn && data.count > conn.lastKnownExists) {
        conn.lastKnownExists = data.count;
        this.emit('new-mail', { accountId: account.id, account, data });
      } else if (conn) {
        conn.lastKnownExists = data.count;
      }
    });

    client.on('expunge', (data) => {
      this.emit('mail-deleted', { accountId: account.id, data });
    });

    client.on('flags', (data) => {
      this.emit('mail-flags-changed', { accountId: account.id, data });
    });

    client.on('error', (err) => {
      console.error(`[SyncWorker] Connection error for ${account.email}:`, err.message);
      // Let 'close' handle the reconnection logic
    });

    client.on('close', () => {
      const conn = this.connections.get(account.id);
      // Ensure we are only reconnecting if this exact client instance is still the active one
      if (conn && conn.client === client && this.running && !this.stopping) {
        const backoff = Math.min(10000 * Math.pow(2, retryCount), 300000); // Max 5 mins
        conn.timer = setTimeout(() => this._reconnect(account, retryCount + 1), backoff);
      }
    });

    try {
      await client.connect();
      const mailboxInfo = await client.mailboxOpen('INBOX');
      entry.lastKnownExists = mailboxInfo.exists;
      // Start IDLE — keeps connection alive and receives server pushes
      await client.idle();
    } catch (err) {
      console.error(`[SyncWorker] Failed to connect account ${account.email}:`, err.message);
      const conn = this.connections.get(account.id);
      if (conn && conn.client === client && this.running && !this.stopping) {
        const backoff = Math.min(10000 * Math.pow(2, retryCount), 300000);
        conn.timer = setTimeout(() => this._reconnect(account, retryCount + 1), backoff);
      }
    }
  }

  async _reconnect(account, retryCount = 0) {
    if (!this.running || this.stopping) return;
    console.log(`[SyncWorker] Reconnecting ${account.email} (attempt ${retryCount})…`);
    try {
      await this.startAccount(account, retryCount);
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
    this.stopping = true;
    this.running = false;
    const ids = [...this.connections.keys()];
    for (const id of ids) {
      await this.stopAccount(id);
    }
    this.stopping = false;
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
