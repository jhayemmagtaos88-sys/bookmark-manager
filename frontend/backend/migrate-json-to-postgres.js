import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createPostgresPool,
  ensurePostgresSchema,
  importJsonStoreIntoPostgres,
} from './storage.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const storePath = path.resolve(process.env.JSON_STORE_PATH || path.join(directory, 'data', 'store.json'));
const execute = process.argv.includes('--execute');

if (!process.env.DATABASE_URL) {
  throw new Error('Set DATABASE_URL to the target PostgreSQL database before running this migration.');
}
if (!fs.existsSync(storePath)) {
  throw new Error(`JSON store not found: ${storePath}`);
}

const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
if (!Array.isArray(store.users) || !Array.isArray(store.bookmarks)) {
  throw new Error('JSON store must contain users and bookmarks arrays.');
}

const pool = createPostgresPool();
try {
  await ensurePostgresSchema(pool);
  const counts = await pool.query(
    `SELECT (SELECT COUNT(*) FROM users)::int AS users,
            (SELECT COUNT(*) FROM bookmarks)::int AS bookmarks`,
  );
  if (counts.rows[0].users || counts.rows[0].bookmarks) {
    throw new Error('Target PostgreSQL database is not empty. No data was imported.');
  }

  if (!execute) {
    console.log(`Dry run: found ${store.users.length} users and ${store.bookmarks.length} bookmarks in ${storePath}.`);
    console.log('The PostgreSQL target is empty. Rerun with --execute to import these records.');
  } else {
    const imported = await importJsonStoreIntoPostgres(pool, store);
    console.log(`Imported ${imported.users} users and ${imported.bookmarks} bookmarks into PostgreSQL.`);
    console.log('The source JSON file was left unchanged.');
  }
} finally {
  await pool.end();
}
