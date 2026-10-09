import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CallRecord, Errand, UserProfile } from '../../../shared/types';
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
      CREATE TABLE IF NOT EXISTS errands (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        call_id TEXT,
        record TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS errands_by_user ON errands(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS errands_by_status ON errands(status);
      CREATE TABLE IF NOT EXISTS usage_events (
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        at INTEGER NOT NULL,
        kind TEXT NOT NULL,
        cost_usd REAL NOT NULL,
        detail TEXT
      );
      CREATE INDEX IF NOT EXISTS usage_by_time ON usage_events(at);
      CREATE TABLE IF NOT EXISTS push_tokens (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
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

  /** Every user (for background jobs such as reminders; a few hundred rows at most for now). */
  allUsers(): UserRow[] {
    return (this.db.prepare('SELECT * FROM users').all() as Record<string, unknown>[]).map((r) => this.toUser(r)!);
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

  /** Deletes one of the user's calls from the history; false if it isn't theirs. */
  deleteCall(userId: string, id: string): boolean {
    return Number(this.db.prepare('DELETE FROM calls WHERE id = ? AND user_id = ?').run(id, userId).changes) > 0;
  }

  // ── usage ── (what isn't a phone call: setting up calls by voice, research, voice samples)
  addUsage(userId: string | null, kind: 'intake' | 'research' | 'voice_sample', costUsd: number, detail?: string) {
    this.db.prepare('INSERT INTO usage_events (user_id, at, kind, cost_usd, detail) VALUES (?, ?, ?, ?, ?)').run(userId, Date.now(), kind, costUsd, detail ?? null);
  }

  // ── push tokens ── (one per installed app; a phone that signs in as someone else moves over)
  addPushToken(userId: string, token: string, platform: string) {
    this.db
      .prepare('INSERT INTO push_tokens (token, user_id, platform, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform')
      .run(token, userId, platform, Date.now());
  }

  removePushToken(token: string, userId?: string) {
    if (userId) this.db.prepare('DELETE FROM push_tokens WHERE token = ? AND user_id = ?').run(token, userId);
    else this.db.prepare('DELETE FROM push_tokens WHERE token = ?').run(token);
  }

  pushTokensFor(userId: string): string[] {
    return (this.db.prepare('SELECT token FROM push_tokens WHERE user_id = ?').all(userId) as { token: string }[]).map((r) => r.token);
  }

  // ── errands ── (the queue of calls the server places on its own)
  saveErrand(e: Errand) {
    this.db
      .prepare(
        'INSERT INTO errands (id, user_id, created_at, status, call_id, record) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, call_id = excluded.call_id, record = excluded.record',
      )
      .run(e.id, e.userId!, e.createdAt, e.status, e.callId ?? null, JSON.stringify(e));
  }

  errand(id: string): Errand | undefined {
    const row = this.db.prepare('SELECT record FROM errands WHERE id = ?').get(id) as { record: string } | undefined;
    return row ? (JSON.parse(row.record) as Errand) : undefined;
  }

  errandForCall(callId: string): Errand | undefined {
    const row = this.db.prepare('SELECT record FROM errands WHERE call_id = ?').get(callId) as { record: string } | undefined;
    return row ? (JSON.parse(row.record) as Errand) : undefined;
  }

  errandsForUser(userId: string, limit = 50): Errand[] {
    return (this.db.prepare('SELECT record FROM errands WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit) as { record: string }[]).map(
      (r) => JSON.parse(r.record) as Errand,
    );
  }

  /** Errands still waiting or on a call, for every user. */
  activeErrands(): Errand[] {
    return (this.db.prepare("SELECT record FROM errands WHERE status IN ('queued', 'calling') ORDER BY created_at").all() as { record: string }[]).map(
      (r) => JSON.parse(r.record) as Errand,
    );
  }
}
