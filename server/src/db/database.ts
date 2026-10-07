import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CallRecord, UserProfile } from '../../../shared/types';
import { emptyProfile } from '../profile/profile';

/**
 * Users, sign-in sessions, profiles, and call history, in one SQLite file (Node's built-in
 * driver, so there's nothing native to install). A single file on the laptop for now; the same
 * interface can sit on Postgres when there's a hosted server.
 */

export interface UserRow {
  id: string;
  phone: string;
  createdAt: number;
  profile: UserProfile;
}

const SESSION_DAYS = 90;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export class Database {
  private readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        profile TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS calls (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        record TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS calls_by_user ON calls(user_id, created_at DESC);
    `);
  }

  // ── users ──
  private toUser(row: Record<string, unknown> | undefined): UserRow | undefined {
    if (!row) return undefined;
    return {
      id: row.id as string,
      phone: row.phone as string,
      createdAt: row.created_at as number,
      profile: { ...emptyProfile(), ...JSON.parse(row.profile as string) },
    };
  }

  userByPhone(phone: string) {
    return this.toUser(this.db.prepare('SELECT * FROM users WHERE phone = ?').get(phone));
  }

  userById(id: string) {
    return this.toUser(this.db.prepare('SELECT * FROM users WHERE id = ?').get(id));
  }

  createUser(phone: string, profile: UserProfile): UserRow {
    const user = { id: randomUUID(), phone, createdAt: Date.now(), profile };
    this.db.prepare('INSERT INTO users (id, phone, created_at, profile) VALUES (?, ?, ?, ?)').run(user.id, phone, user.createdAt, JSON.stringify(profile));
    return user;
  }

  saveProfile(userId: string, profile: UserProfile) {
    this.db.prepare('UPDATE users SET profile = ? WHERE id = ?').run(JSON.stringify(profile), userId);
  }

  /** Deletes the user and everything tied to them (sessions, call history). */
  deleteUser(userId: string) {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  // ── sessions ── (only a hash of the token is stored)
  createSession(userId: string): string {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    this.db
      .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(hashToken(token), userId, now, now + SESSION_DAYS * 86_400_000);
    return token;
  }

  userForToken(token: string): UserRow | undefined {
    const row = this.db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(hashToken(token)) as
      | { user_id: string; expires_at: number }
      | undefined;
    if (!row || row.expires_at < Date.now()) return undefined;
    return this.userById(row.user_id);
  }

  deleteSession(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  }

  // ── calls ──
  saveCall(record: CallRecord) {
    this.db
      .prepare('INSERT INTO calls (id, user_id, created_at, record) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET record = excluded.record')
      .run(record.id, record.userId ?? null, record.createdAt, JSON.stringify(record));
  }

  call(id: string): CallRecord | undefined {
    const row = this.db.prepare('SELECT record FROM calls WHERE id = ?').get(id) as { record: string } | undefined;
    return row ? (JSON.parse(row.record) as CallRecord) : undefined;
  }

  callsForUser(userId: string, limit = 50): CallRecord[] {
    return (this.db.prepare('SELECT record FROM calls WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit) as { record: string }[]).map(
      (r) => JSON.parse(r.record) as CallRecord,
    );
  }
}
