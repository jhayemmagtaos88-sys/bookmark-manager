import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const directory = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(directory, 'data');
const dbFile = path.join(dataDir, 'store.json');
const backupDir = path.join(dataDir, 'backups');
const retentionValue = Number.parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);
const backupRetentionDays = Number.isInteger(retentionValue) && retentionValue > 0 ? retentionValue : 30;
const bookmarkFields = {
  title: 'title',
  url: 'url',
  favorite: 'favorite',
  tags: 'tags',
  folderId: 'folder_id',
  folderLabel: 'folder_label',
  type: 'type',
  source: 'source',
  notes: 'notes',
  reminderDate: 'reminder_date',
};

const ensureJsonStorage = () => {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbFile)) {
    fs.writeFileSync(dbFile, JSON.stringify({ users: [], bookmarks: [] }, null, 2));
  }
};

const createDailyBackup = () => {
  ensureJsonStorage();
  fs.mkdirSync(backupDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const backupFile = path.join(backupDir, `store-${date}.json`);
  if (!fs.existsSync(backupFile)) {
    fs.copyFileSync(dbFile, backupFile, fs.constants.COPYFILE_EXCL);
  }

  const cutoff = Date.now() - backupRetentionDays * 24 * 60 * 60 * 1000;
  for (const name of fs.readdirSync(backupDir)) {
    if (!/^store-\d{4}-\d{2}-\d{2}\.json$/.test(name)) continue;
    const file = path.join(backupDir, name);
    if (fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
  }
};

const readJsonStore = () => {
  ensureJsonStorage();
  return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
};

const writeJsonStore = (store) => {
  ensureJsonStorage();
  createDailyBackup();
  const tempFile = `${dbFile}.${process.pid}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(store, null, 2));
  fs.renameSync(tempFile, dbFile);
};

const toUser = (row) => row && ({
  id: row.id,
  name: row.name,
  email: row.email,
  password: row.password_hash ?? row.password,
  sessionVersion: row.session_version ?? row.sessionVersion ?? 0,
  createdAt: row.created_at ?? row.createdAt,
});

const toBookmark = (row) => row && ({
  id: row.id,
  userId: row.user_id ?? row.userId,
  clientId: row.client_id ?? row.clientId,
  title: row.title,
  url: row.url,
  favorite: row.favorite,
  tags: row.tags,
  folderId: row.folder_id ?? row.folderId,
  folderLabel: row.folder_label ?? row.folderLabel,
  type: row.type,
  source: row.source,
  notes: row.notes || '',
  reminderDate: row.reminder_date ?? row.reminderDate ?? '',
  createdAt: row.created_at ?? row.createdAt,
  updatedAt: row.updated_at ?? row.updatedAt,
});

const normalizeUser = (user) => ({
  ...user,
  email: user.email.toLowerCase(),
  sessionVersion: user.sessionVersion || 0,
});

class JsonStorage {
  async init() {
    ensureJsonStorage();
    createDailyBackup();
    const backupTimer = setInterval(() => {
      try {
        createDailyBackup();
      } catch (error) {
        console.error('Unable to create the daily data backup:', error);
      }
    }, 24 * 60 * 60 * 1000);
    backupTimer.unref();
  }

  async findUserByEmail(email) {
    return readJsonStore().users.find((user) => user.email.toLowerCase() === email.toLowerCase()) || null;
  }

  async findUserById(id) {
    return readJsonStore().users.find((user) => user.id === id) || null;
  }

  async createUser(user) {
    const store = readJsonStore();
    if (store.users.some((entry) => entry.email.toLowerCase() === user.email.toLowerCase())) {
      const error = new Error('User already exists');
      error.code = 'USER_EXISTS';
      throw error;
    }
    const newUser = normalizeUser(user);
    store.users.push(newUser);
    writeJsonStore(store);
    return newUser;
  }

  async incrementSessionVersion(id) {
    const store = readJsonStore();
    const user = store.users.find((entry) => entry.id === id);
    if (!user) return null;
    user.sessionVersion = (user.sessionVersion || 0) + 1;
    writeJsonStore(store);
    return user;
  }

  async listBookmarks(userId) {
    return readJsonStore().bookmarks.filter((bookmark) => bookmark.userId === userId);
  }

  async createBookmark(bookmark) {
    const store = readJsonStore();
    if (bookmark.clientId) {
      const existing = store.bookmarks.find(
        (entry) => entry.userId === bookmark.userId && entry.clientId === bookmark.clientId,
      );
      if (existing) return { bookmark: existing, created: false };
    }
    store.bookmarks.push(bookmark);
    writeJsonStore(store);
    return { bookmark, created: true };
  }

  async updateBookmark(id, userId, updates, expectedUpdatedAt) {
    const store = readJsonStore();
    const index = store.bookmarks.findIndex((entry) => entry.id === id && entry.userId === userId);
    if (index < 0) return { kind: 'not_found' };

    const existing = store.bookmarks[index];
    if (expectedUpdatedAt && expectedUpdatedAt !== existing.updatedAt) {
      return { kind: 'conflict', bookmark: existing };
    }

    const bookmark = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    store.bookmarks[index] = bookmark;
    writeJsonStore(store);
    return { kind: 'updated', bookmark };
  }

  async deleteBookmark(id, userId) {
    const store = readJsonStore();
    const initialLength = store.bookmarks.length;
    store.bookmarks = store.bookmarks.filter((bookmark) => !(bookmark.id === id && bookmark.userId === userId));
    if (store.bookmarks.length === initialLength) return false;
    writeJsonStore(store);
    return true;
  }
}

class PostgresStorage {
  constructor(connectionString) {
    this.pool = new Pool({
      connectionString,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });
  }

  async init() {
    await this.pool.query(createPostgresSchema);
  }

  async findUserByEmail(email) {
    const result = await this.pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    return toUser(result.rows[0]);
  }

  async findUserById(id) {
    const result = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return toUser(result.rows[0]);
  }

  async createUser(user) {
    try {
      const result = await this.pool.query(
        `INSERT INTO users (id, name, email, password_hash, session_version, created_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [user.id, user.name, user.email.toLowerCase(), user.password, user.sessionVersion || 0, user.createdAt],
      );
      return toUser(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') {
        error.code = 'USER_EXISTS';
      }
      throw error;
    }
  }

  async incrementSessionVersion(id) {
    const result = await this.pool.query(
      'UPDATE users SET session_version = session_version + 1 WHERE id = $1 RETURNING *',
      [id],
    );
    return toUser(result.rows[0]);
  }

  async listBookmarks(userId) {
    const result = await this.pool.query('SELECT * FROM bookmarks WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return result.rows.map(toBookmark);
  }

  async createBookmark(bookmark) {
    const result = await this.pool.query(
      `INSERT INTO bookmarks
        (id, user_id, client_id, title, url, favorite, tags, folder_id, folder_label, type, source, notes, reminder_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (user_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
       RETURNING *`,
      [
        bookmark.id, bookmark.userId, bookmark.clientId || null, bookmark.title, bookmark.url, bookmark.favorite,
        JSON.stringify(bookmark.tags), bookmark.folderId, bookmark.folderLabel, bookmark.type, bookmark.source,
        bookmark.notes, bookmark.reminderDate, bookmark.createdAt, bookmark.updatedAt,
      ],
    );
    if (result.rows[0]) return { bookmark: toBookmark(result.rows[0]), created: true };
    const existing = await this.pool.query(
      'SELECT * FROM bookmarks WHERE user_id = $1 AND client_id = $2',
      [bookmark.userId, bookmark.clientId],
    );
    if (!existing.rows[0]) throw new Error('Bookmark create was not stored.');
    return { bookmark: toBookmark(existing.rows[0]), created: false };
  }

  async updateBookmark(id, userId, updates, expectedUpdatedAt) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        'SELECT * FROM bookmarks WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [id, userId],
      );
      if (!found.rows[0]) {
        await client.query('ROLLBACK');
        return { kind: 'not_found' };
      }

      const existing = toBookmark(found.rows[0]);
      if (expectedUpdatedAt && expectedUpdatedAt !== existing.updatedAt) {
        await client.query('ROLLBACK');
        return { kind: 'conflict', bookmark: existing };
      }

      const next = { ...existing, ...updates, updatedAt: new Date().toISOString() };
      const columns = Object.entries(bookmarkFields).filter(([field]) => Object.hasOwn(updates, field));
      const values = columns.map(([field]) => field === 'tags' ? JSON.stringify(next[field]) : next[field]);
      const setClauses = columns.map(([field, column], index) =>
        `${column} = $${index + 3}${field === 'tags' ? '::jsonb' : ''}`,
      );
      setClauses.push(`updated_at = $${values.length + 3}`);
      const result = await client.query(
        `UPDATE bookmarks SET ${setClauses.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
        [id, userId, ...values, next.updatedAt],
      );
      await client.query('COMMIT');
      return { kind: 'updated', bookmark: toBookmark(result.rows[0]) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteBookmark(id, userId) {
    const result = await this.pool.query(
      'DELETE FROM bookmarks WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId],
    );
    return result.rowCount > 0;
  }

  async close() {
    await this.pool.end();
  }
}

export const createStorage = () => process.env.DATABASE_URL
  ? new PostgresStorage(process.env.DATABASE_URL)
  : new JsonStorage();

export const createPostgresPool = (connectionString = process.env.DATABASE_URL) => {
  if (!connectionString) throw new Error('DATABASE_URL is required for PostgreSQL storage.');
  return new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
};

export const ensurePostgresSchema = async (pool) => {
  await pool.query(createPostgresSchema);
};

export const createPostgresSchema = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    session_version INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id TEXT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    favorite BOOLEAN NOT NULL DEFAULT FALSE,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    folder_id TEXT NOT NULL DEFAULT 'work',
    folder_label TEXT NOT NULL DEFAULT 'Work',
    type TEXT NOT NULL DEFAULT 'bookmark',
    source TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    reminder_date TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS bookmarks_user_client_id_unique
    ON bookmarks (user_id, client_id) WHERE client_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS bookmarks_user_id_idx ON bookmarks (user_id);
`;

export const importJsonStoreIntoPostgres = async (pool, store) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const counts = await client.query(
      `SELECT (SELECT COUNT(*) FROM users)::int AS users,
              (SELECT COUNT(*) FROM bookmarks)::int AS bookmarks`,
    );
    if (counts.rows[0].users || counts.rows[0].bookmarks) {
      throw new Error('PostgreSQL database is not empty. Import stopped to avoid overwriting existing records.');
    }

    for (const rawUser of store.users || []) {
      const user = normalizeUser(rawUser);
      await client.query(
        `INSERT INTO users (id, name, email, password_hash, session_version, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, user.name, user.email, user.password, user.sessionVersion, user.createdAt],
      );
    }

    for (const bookmark of store.bookmarks || []) {
      await client.query(
        `INSERT INTO bookmarks
          (id, user_id, client_id, title, url, favorite, tags, folder_id, folder_label, type, source, notes, reminder_date, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          bookmark.id, bookmark.userId, bookmark.clientId || null, bookmark.title, bookmark.url, !!bookmark.favorite,
          JSON.stringify(Array.isArray(bookmark.tags) ? bookmark.tags : []),
          bookmark.folderId || 'work', bookmark.folderLabel || 'Work', bookmark.type || 'bookmark',
          bookmark.source || bookmark.url, bookmark.notes || '', bookmark.reminderDate || '',
          bookmark.createdAt || new Date().toISOString(), bookmark.updatedAt || bookmark.createdAt || new Date().toISOString(),
        ],
      );
    }

    await client.query('COMMIT');
    return { users: (store.users || []).length, bookmarks: (store.bookmarks || []).length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
