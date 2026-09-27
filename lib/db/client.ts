import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';

const globalForDb = globalThis as unknown as { sqlite?: Database.Database };

// DATABASE_URL is kept in the Prisma "file:./path.db" shape for continuity
// with the rest of the config, and stripped down to a plain filesystem path
// here.
function resolveDbPath(): string {
  const raw = process.env.DATABASE_URL || 'file:./dev.db';
  const stripped = raw.replace(/^file:/, '');
  return path.resolve(process.cwd(), stripped);
}

const dbPath = resolveDbPath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = globalForDb.sqlite ?? new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

if (process.env.NODE_ENV !== 'production') {
  globalForDb.sqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { sqlite };
