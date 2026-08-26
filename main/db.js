/**
 * db.js — SQLite via sql.js (pure WebAssembly, no native compilation needed)
 *
 * sql.js keeps the database in memory and we flush it to disk after every
 * write. For an email client workload this is perfectly fast.
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let SQL = null;   // sql.js module (loaded async once)
let db = null;    // sql.js Database instance
let dbPath = null;

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function init() {
  if (db) return db;

  // sql.js ships its own WASM file — point it at the correct location
  const sqlJsPath = path.join(
    path.dirname(require.resolve('sql.js')),
    '..',
    'dist'
  );
  SQL = await require('sql.js')({
    locateFile: (file) => path.join(sqlJsPath, file),
  });

  dbPath = path.join(app.getPath('userData'), 'coremail.db');

  let fileBuffer = null;
  if (fs.existsSync(dbPath)) {
    fileBuffer = fs.readFileSync(dbPath);
  }

  db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();

  db.run('PRAGMA journal_mode = WAL;');
  db.run('PRAGMA foreign_keys = ON;');

  _initSchema();
  _save(); // persist any new schema immediately

  return db;
}

/** Flush in-memory DB to disk. Call after every write. */
function _save() {
  if (!db || !dbPath) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

// ─── Schema ──────────────────────────────────────────────────────────────────

function _initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      imap_host TEXT NOT NULL,
      imap_port INTEGER NOT NULL DEFAULT 993,
      imap_secure INTEGER NOT NULL DEFAULT 1,
      smtp_host TEXT NOT NULL,
      smtp_port INTEGER NOT NULL DEFAULT 465,
      smtp_secure INTEGER NOT NULL DEFAULT 1,
      password TEXT NOT NULL,
      avatar_color TEXT DEFAULT '#6c757d',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#0d6efd',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS folder_accounts (
      folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      PRIMARY KEY (folder_id, account_id)
    );

    CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      mailbox TEXT NOT NULL DEFAULT 'INBOX',
      uid INTEGER NOT NULL,
      message_id TEXT,
      subject TEXT,
      from_name TEXT,
      from_email TEXT,
      to_addresses TEXT,
      cc_addresses TEXT,
      date TEXT,
      body_text TEXT,
      body_html TEXT,
      flags TEXT DEFAULT '[]',
      attachments TEXT DEFAULT '[]',
      is_read INTEGER DEFAULT 0,
      is_starred INTEGER DEFAULT 0,
      size INTEGER DEFAULT 0,
      UNIQUE(account_id, mailbox, uid)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Default settings
  const defaults = {
    theme: 'dark',
    launch_at_startup: 'false',
    notification_sound: 'true',
    sync_interval_seconds: '60',
    read_receipts_enabled: 'false',
  };
  for (const [k, v] of Object.entries(defaults)) {
    db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [k, v]);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Run a SELECT and return all rows as plain objects */
function _all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/** Run a SELECT and return the first row, or undefined */
function _get(sql, params = []) {
  const rows = _all(sql, params);
  return rows[0];
}

/** Run INSERT/UPDATE/DELETE and return { lastInsertRowid, changes } */
function _run(sql, params = []) {
  db.run(sql, params);
  // Read rowid BEFORE _save() — db.export() can reset the internal rowid tracker
  const lastInsertRowid = db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] ?? null;
  const changes = db.getRowsModified();
  _save();
  return { lastInsertRowid, changes };
}

// ─── Accounts ────────────────────────────────────────────────────────────────

const accounts = {
  getAll: () => _all('SELECT * FROM accounts ORDER BY name'),
  getById: (id) => _get('SELECT * FROM accounts WHERE id = ?', [id]),
  /**
   * Insert a new account and return the full inserted row.
   * Avoids relying on lastInsertRowid by querying back by unique email.
   */
  create: (data) => {
    _run(
      `INSERT INTO accounts (name, email, imap_host, imap_port, imap_secure,
         smtp_host, smtp_port, smtp_secure, password, avatar_color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.name, data.email, data.imap_host, data.imap_port,
       data.imap_secure ? 1 : 0, data.smtp_host, data.smtp_port,
       data.smtp_secure ? 1 : 0, data.password, data.avatar_color || '#6c757d']
    );
    // Query back by unique email — fully reliable regardless of rowid quirks
    return _get('SELECT * FROM accounts WHERE email = ?', [data.email]);
  },
  update: (id, data) => _run(
    `UPDATE accounts SET name=?, email=?, imap_host=?, imap_port=?,
       imap_secure=?, smtp_host=?, smtp_port=?, smtp_secure=?, password=?
     WHERE id=?`,
    [data.name, data.email, data.imap_host, data.imap_port,
     data.imap_secure ? 1 : 0, data.smtp_host, data.smtp_port,
     data.smtp_secure ? 1 : 0, data.password, id]
  ),
  delete: (id) => _run('DELETE FROM accounts WHERE id = ?', [id]),
};

// ─── Folders ─────────────────────────────────────────────────────────────────

const folders = {
  getAll: () => {
    const flds = _all('SELECT * FROM folders ORDER BY name');
    return flds.map((f) => ({
      ...f,
      accountIds: _all(
        'SELECT account_id FROM folder_accounts WHERE folder_id = ?', [f.id]
      ).map((r) => r.account_id),
    }));
  },
  create: (name, color) =>
    _run('INSERT INTO folders (name, color) VALUES (?, ?)', [name, color || '#0d6efd']),
  update: (id, name, color, accountIds) => {
    _run('UPDATE folders SET name=?, color=? WHERE id=?', [name, color, id]);
    _run('DELETE FROM folder_accounts WHERE folder_id=?', [id]);
    for (const aid of accountIds) {
      _run('INSERT OR IGNORE INTO folder_accounts (folder_id, account_id) VALUES (?, ?)', [id, aid]);
    }
  },
  delete: (id) => _run('DELETE FROM folders WHERE id = ?', [id]),
  setAccounts: (folderId, accountIds) => {
    _run('DELETE FROM folder_accounts WHERE folder_id=?', [folderId]);
    for (const aid of accountIds) {
      _run('INSERT OR IGNORE INTO folder_accounts (folder_id, account_id) VALUES (?, ?)', [folderId, aid]);
    }
  },
};

// ─── Emails ──────────────────────────────────────────────────────────────────

const emails = {
  getByAccountAndMailbox: (accountId, mailbox, limit = 100) =>
    _all(
      'SELECT * FROM emails WHERE account_id=? AND mailbox=? ORDER BY date DESC LIMIT ?',
      [accountId, mailbox, limit]
    ),
  getById: (id) => _get('SELECT * FROM emails WHERE id=?', [id]),
  upsert: (data) => _run(
    `INSERT INTO emails (account_id, mailbox, uid, message_id, subject,
       from_name, from_email, to_addresses, cc_addresses, date,
       body_text, body_html, flags, attachments, is_read, is_starred, size)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(account_id, mailbox, uid) DO UPDATE SET
       flags=excluded.flags,
       is_read=excluded.is_read,
       is_starred=excluded.is_starred,
       body_text=COALESCE(excluded.body_text, body_text),
       body_html=COALESCE(excluded.body_html, body_html)`,
    [
      data.account_id, data.mailbox, data.uid, data.message_id,
      data.subject, data.from_name, data.from_email,
      data.to_addresses, data.cc_addresses, data.date,
      data.body_text, data.body_html, data.flags,
      data.attachments, data.is_read, data.is_starred, data.size,
    ]
  ),
  markRead: (id, isRead) =>
    _run('UPDATE emails SET is_read=? WHERE id=?', [isRead ? 1 : 0, id]),
  markStarred: (id, isStarred) =>
    _run('UPDATE emails SET is_starred=? WHERE id=?', [isStarred ? 1 : 0, id]),
  delete: (id) => _run('DELETE FROM emails WHERE id=?', [id]),
  getUnreadCount: (accountId, mailbox) =>
    _get(
      'SELECT COUNT(*) as count FROM emails WHERE account_id=? AND mailbox=? AND is_read=0',
      [accountId, mailbox]
    ),
};

// ─── Settings ─────────────────────────────────────────────────────────────────

const settings = {
  get: (key) => {
    const row = _get('SELECT value FROM settings WHERE key=?', [key]);
    return row ? row.value : null;
  },
  set: (key, value) =>
    _run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, String(value)]),
  getAll: () => {
    const rows = _all('SELECT key, value FROM settings');
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
};

module.exports = { init, accounts, folders, emails, settings };
