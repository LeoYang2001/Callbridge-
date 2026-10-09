#!/usr/bin/env node
// Usage and estimated cost per user over a date range, from the call database: calls, plus
// setting up calls by voice in the app (intake), research lookups and voice samples.
//   npm run usage                      (yesterday, in America/Chicago)
//   npm run usage -- 2026-10-01 2026-10-07
// Calls placed before cost tracking existed are estimated from their length ($0.08 per
// OpenAI minute, Twilio per started minute) and marked with ~.
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const TZ = process.env.REPORT_TZ || 'America/Chicago';
const file = path.resolve(process.env.DATABASE_FILE || 'data/callbridge.db');
const day = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const [from = day(new Date(Date.now() - 86_400_000)), to = from] = process.argv.slice(2);

const db = new DatabaseSync(file, { readOnly: true });
const users = new Map(db.prepare('SELECT id, phone, profile FROM users').all().map((u) => [u.id, { phone: u.phone, name: JSON.parse(u.profile).name }]));
const rows = db.prepare('SELECT user_id, created_at, record FROM calls ORDER BY created_at').all();

const per = new Map();
for (const row of rows) {
  const d = day(new Date(row.created_at));
  if (d < from || d > to) continue;
  const r = JSON.parse(row.record);
  const m = r.metrics ?? {};
  const sec = m.answeredAt && m.endedAt ? (m.endedAt - m.answeredAt) / 1000 : 0;
  const cost = m.costUsd ?? { openai: (sec / 60) * 0.08, twilio: Math.ceil(sec / 60) * 0.014, estimated: true };
  const k = row.user_id ?? '(no account)';
  const t = per.get(k) ?? { calls: 0, answered: 0, minutes: 0, openai: 0, twilio: 0, estimated: false };
  t.calls++;
  if (sec > 0) t.answered++;
  t.minutes += sec / 60;
  t.openai += cost.openai;
  t.twilio += cost.twilio;
  t.estimated ||= Boolean(cost.estimated);
  per.set(k, t);
}

console.log(`Calls ${from}${to !== from ? ` to ${to}` : ''} (${TZ})\n`);
let all = { calls: 0, minutes: 0, openai: 0, twilio: 0 };
for (const [k, t] of per) {
  const u = users.get(k);
  const who = u ? `${u.name || '—'} ${u.phone}` : k;
  const mark = t.estimated ? '~' : ' ';
  console.log(`${who.padEnd(28)} ${String(t.calls).padStart(3)} calls (${t.answered} answered) ${t.minutes.toFixed(1).padStart(6)} min  OpenAI ${mark}$${t.openai.toFixed(2)}  Twilio ${mark}$${t.twilio.toFixed(2)}  per min ${mark}$${t.minutes ? ((t.openai + t.twilio) / t.minutes).toFixed(3) : '—'}`);
  all = { calls: all.calls + t.calls, minutes: all.minutes + t.minutes, openai: all.openai + t.openai, twilio: all.twilio + t.twilio };
}
console.log(`\nCalls: ${all.calls}, ${all.minutes.toFixed(1)} min, $${(all.openai + all.twilio).toFixed(2)} (OpenAI $${all.openai.toFixed(2)}, Twilio $${all.twilio.toFixed(2)}).`);

// Everything else (tracked since the usage table was added; earlier use isn't in it).
const hasUsage = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'usage_events'").get();
let other = 0;
if (hasUsage) {
  const kinds = new Map();
  for (const row of db.prepare('SELECT user_id, at, kind, cost_usd FROM usage_events ORDER BY at').all()) {
    const d = day(new Date(row.at));
    if (d < from || d > to) continue;
    const k = kinds.get(row.kind) ?? { n: 0, usd: 0 };
    k.n++;
    k.usd += row.cost_usd;
    kinds.set(row.kind, k);
    other += row.cost_usd;
  }
  const label = { intake: 'Setting up calls (voice, per reply)', research: 'Research lookups', voice_sample: 'Voice samples' };
  console.log('');
  for (const [kind, k] of kinds) console.log(`${(label[kind] ?? kind).padEnd(38)} ${String(k.n).padStart(4)}  $${k.usd.toFixed(2)}`);
}
console.log(`\nTotal $${(all.openai + all.twilio + other).toFixed(2)} (estimates at list prices; sign-in texts are extra).`);
