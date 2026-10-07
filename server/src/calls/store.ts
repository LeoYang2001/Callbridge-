import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CallRecord } from '../../../shared/types';

const MAX_EVENTS = 500;

/**
 * In-memory call store with change notifications (feeds the UI's server-sent events).
 * Single-process by design for the MVP; swap for Redis/Postgres when there is more than one node.
 */
export class CallStore {
  private readonly calls = new Map<string, CallRecord>();
  private readonly emitter = new EventEmitter();

  constructor(
    private readonly persistDir: string | null,
    /** Call history lives in the database; files in persistDir are kept for debugging. */
    private readonly db?: { saveCall(r: CallRecord): void; call(id: string): CallRecord | undefined },
  ) {
    this.emitter.setMaxListeners(100);
  }

  create(record: CallRecord) {
    this.calls.set(record.id, record);
    this.emit(record);
  }

  get(id: string) {
    return this.calls.get(id);
  }

  /** A call in memory, or one persisted before the last restart (finished calls only). */
  getOrLoad(id: string): CallRecord | undefined {
    const live = this.calls.get(id) ?? this.db?.call(id);
    if (live || !this.persistDir || !/^[0-9a-f-]{36}$/.test(id)) return live;
    try {
      return JSON.parse(readFileSync(path.join(this.persistDir, `${id}.json`), 'utf8')) as CallRecord;
    } catch {
      return undefined;
    }
  }

  list() {
    return [...this.calls.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Mutate a record in place and notify subscribers. */
  update(id: string, mutate: (r: CallRecord) => void) {
    const r = this.calls.get(id);
    if (!r) return;
    mutate(r);
    if (r.events.length > MAX_EVENTS) r.events.splice(0, r.events.length - MAX_EVENTS);
    r.updatedAt = Date.now();
    this.emit(r);
  }

  subscribe(id: string, listener: (r: CallRecord) => void) {
    const key = `call:${id}`;
    this.emitter.on(key, listener);
    return () => this.emitter.off(key, listener);
  }

  async persist(id: string) {
    const r = this.calls.get(id);
    if (r) this.db?.saveCall(r);
    if (!r || !this.persistDir) return;
    await mkdir(this.persistDir, { recursive: true });
    await writeFile(path.join(this.persistDir, `${id}.json`), JSON.stringify(r, null, 2));
  }

  private emit(r: CallRecord) {
    this.emitter.emit(`call:${r.id}`, r);
  }
}
