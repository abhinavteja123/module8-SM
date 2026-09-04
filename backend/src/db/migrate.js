import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from './client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '..', '..', 'db', 'schema.sql');

async function migrate() {
  const sql = readFileSync(schemaPath, 'utf8');
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;'); // gen_random_uuid()
  await pool.query(sql);
  console.log('[migrate] schema applied.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
});
