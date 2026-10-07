#!/usr/bin/env node
// Finishes Twilio setup using the credentials in .env:
//   npm run twilio:setup
// 1. Checks the account is upgraded (trial accounts can't stream call audio to the AI).
// 2. Uses a voice number you already own, or offers to buy one (asks before spending).
// 3. Writes it to TWILIO_FROM_NUMBER in .env.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import twilio from 'twilio';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};
const ok = (m) => console.log(`${c.green('✓')} ${m}`);
const warn = (m) => console.log(`${c.yellow('!')} ${m}`);
const fail = (m) => {
  console.error(`${c.red('✖')} ${m}`);
  process.exit(1);
};

function readEnv() {
  if (!existsSync(envPath)) fail('No .env yet. Run `npm run laptop` once first to create it.');
  const text = readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return { text, env };
}

function setEnvValue(text, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(`${question} ${c.dim('[y/N]')} `, resolve));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

const { text, env } = readEnv();
const sid = env.TWILIO_ACCOUNT_SID;
const token = env.TWILIO_AUTH_TOKEN;
if (!sid?.startsWith('AC') || !token) fail('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are missing in .env.');

const client = twilio(sid, token);

// ── 1. Account ──────────────────────────────────────────────────────────────
let account;
try {
  account = await client.api.v2010.accounts(sid).fetch();
} catch (err) {
  fail(`Twilio rejected the credentials in .env: ${err.message}`);
}
if (account.type === 'Trial') {
  warn(`This account is still a ${c.bold('trial')}. If you just upgraded, wait a minute and run this again.`);
  warn('Trial accounts block the live audio stream CallBridge needs.');
} else {
  ok(`Account "${account.friendlyName}" is upgraded (${account.type}).`);
}

// ── 2. Voice number ─────────────────────────────────────────────────────────
const owned = (await client.incomingPhoneNumbers.list({ limit: 50 })).filter((n) => n.capabilities?.voice);
let number = owned.find((n) => n.phoneNumber === env.TWILIO_FROM_NUMBER)?.phoneNumber ?? owned[0]?.phoneNumber;

if (number) {
  ok(`Using your Twilio number ${c.bold(number)}.`);
} else {
  // Prefer the same area code as the test phone, so the call looks local.
  const testNumber = (env.ALLOWED_DESTINATIONS ?? '').split(',')[0]?.replace(/\D/g, '') ?? '';
  const areaCode = testNumber.length === 11 && testNumber.startsWith('1') ? Number(testNumber.slice(1, 4)) : undefined;
  let candidates = [];
  if (areaCode) candidates = await client.availablePhoneNumbers('US').local.list({ areaCode, voiceEnabled: true, limit: 3 }).catch(() => []);
  if (!candidates.length) candidates = await client.availablePhoneNumbers('US').local.list({ voiceEnabled: true, limit: 3 });
  if (!candidates.length) fail('Twilio returned no available US voice numbers. Buy one in the console: Phone Numbers → Buy a number.');

  const pick = candidates[0];
  console.log(`\nYou don't own a voice number yet. Available: ${c.bold(pick.friendlyName)} (${pick.locality || pick.region || 'US'})`);
  console.log(c.dim('US local numbers cost about $1.15/month on Twilio (check your console for the exact price).'));
  if (!(await confirm(`Buy ${pick.phoneNumber} now?`))) {
    fail('Not bought. Run this again when ready, or buy one in the console and re-run.');
  }
  try {
    const bought = await client.incomingPhoneNumbers.create({ phoneNumber: pick.phoneNumber, friendlyName: 'CallBridge' });
    number = bought.phoneNumber;
    ok(`Bought ${c.bold(number)}.`);
  } catch (err) {
    fail(`Twilio couldn't buy the number: ${err.message}`);
  }
}

// ── 3. .env ─────────────────────────────────────────────────────────────────
if (env.TWILIO_FROM_NUMBER === number) {
  ok('.env already uses this number.');
} else {
  writeFileSync(envPath, setEnvValue(text, 'TWILIO_FROM_NUMBER', number), { mode: 0o600 });
  ok(`Saved TWILIO_FROM_NUMBER=${number} in .env.`);
}

console.log(`\n${c.bold('Next:')} restart the server so it picks this up:
  ${c.bold('Ctrl+C')} in the terminal running it, then ${c.bold('npm run laptop')}, and scan the new QR code.
${c.dim(`Test calls can only go to ALLOWED_DESTINATIONS in .env (${env.ALLOWED_DESTINATIONS || 'not set: any number'}).`)}`);
