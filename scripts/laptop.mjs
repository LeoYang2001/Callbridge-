#!/usr/bin/env node
// One-command local run for testing on a laptop:
//   npm run laptop
// 1. Creates .env on first run (asks for Twilio + OpenAI keys).
// 2. Builds the web app.
// 3. Opens a free Cloudflare quick tunnel (https://<random>.trycloudflare.com) so Twilio and your
//    phone can reach this laptop, and points the server at it.
// 4. Starts the server and prints a QR code to open the app on your phone.
// Ctrl+C stops everything.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const isWin = process.platform === 'win32';
const PORT = 3000;

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};
const step = (msg) => console.log(`\n${c.cyan('▸')} ${c.bold(msg)}`);
const fail = (msg) => {
  console.error(`\n${c.red('✖')} ${msg}`);
  process.exit(1);
};

// ── 0. Node version ─────────────────────────────────────────────────────────
const [major] = process.versions.node.split('.').map(Number);
if (major < 22) fail(`Node.js 22.13 or newer is required (you have ${process.versions.node}). Install it from https://nodejs.org`);

// ── 1. .env ─────────────────────────────────────────────────────────────────
function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

/** "7475550123" → "+17475550123" (US default); leaves numbers that already have "+" alone. */
function toE164(input) {
  const digits = input.replace(/\D/g, '');
  if (!digits) return '';
  if (input.trim().startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

async function createEnv() {
  step('First run: creating .env (your keys stay on this laptop)');
  console.log(c.dim('  Press Enter to skip a value; you can edit .env later.\n'));
  // A line queue (rather than rl.question) also works when answers are piped in.
  const rl = createInterface({ input: process.stdin });
  const lines = [];
  const waiters = [];
  let closed = false;
  rl.on('line', (l) => (waiters.length ? waiters.shift()(l) : lines.push(l)));
  rl.on('close', () => {
    closed = true;
    while (waiters.length) waiters.shift()('');
  });
  const nextLine = () => (lines.length ? Promise.resolve(lines.shift()) : closed ? Promise.resolve('') : new Promise((r) => waiters.push(r)));
  const ask = async (q, fallback = '') => {
    process.stdout.write(`  ${q}${fallback ? c.dim(` [${fallback}]`) : ''}: `);
    const answer = (await nextLine()).trim();
    if (!process.stdin.isTTY) process.stdout.write('\n');
    return answer || fallback;
  };

  const openai = await ask('OpenAI API key (sk-…)');
  const sid = await ask('Twilio Account SID (AC…)');
  const token = await ask('Twilio Auth Token');
  const from = toE164(await ask('Twilio phone number to call from (+1…)'));
  const allow = toE164(await ask('Your own mobile number (+1…). Only this number can sign up and be called while testing'));
  rl.close();

  const example = readFileSync(path.join(root, '.env.example'), 'utf8');
  const values = {
    OPENAI_API_KEY: openai,
    TWILIO_ACCOUNT_SID: sid,
    TWILIO_AUTH_TOKEN: token,
    TWILIO_FROM_NUMBER: from,
    ALLOWED_DESTINATIONS: allow,
    SIGNUP_ALLOWLIST: allow,
    AUTH_CODES: 'log',
    // Set automatically from the tunnel on every run.
    PUBLIC_BASE_URL: '',
  };
  const text = example.replace(/^([A-Z0-9_]+)=.*$/gm, (line, key) => (key in values ? `${key}=${values[key]}` : line));
  writeFileSync(envPath, text, { mode: 0o600 });
  console.log(`\n  ${c.green('✓')} Saved ${path.relative(process.cwd(), envPath) || '.env'}`);
}

if (!existsSync(envPath)) await createEnv();
const env = parseEnv(readFileSync(envPath, 'utf8'));
const missing = ['OPENAI_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'].filter((k) => !env[k]);
if (missing.length) {
  console.log(`\n${c.yellow('!')} .env is missing ${missing.join(', ')}. The app will open, but only demo mode works until you add them.`);
}
if (!env.SIGNUP_ALLOWLIST) console.log(`${c.yellow('!')} SIGNUP_ALLOWLIST is empty: anyone with the tunnel URL could sign up and place calls. Set it in .env.`);

// ── 2. Install + build ──────────────────────────────────────────────────────
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: isWin });
  if (r.status !== 0) fail(`\`${cmd} ${args.join(' ')}\` failed.`);
};
if (!existsSync(path.join(root, 'node_modules'))) {
  step('Installing dependencies (first run only)');
  run('npm', ['install']);
}
step('Building the web app');
run('npm', ['run', 'build', '--silent']);

// ── 3. Tunnel ───────────────────────────────────────────────────────────────
const children = [];
const shutdown = (code = 0) => {
  for (const ch of children) ch.kill('SIGINT');
  setTimeout(() => process.exit(code), 300);
};
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return null;
}

function startTunnel() {
  return new Promise((resolve) => {
    const has = spawnSync('cloudflared', ['--version'], { shell: isWin }).status === 0;
    if (!has) return resolve(null);
    const t = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], { shell: isWin });
    children.push(t);
    const timer = setTimeout(() => resolve(null), 30_000);
    const onData = (buf) => {
      const m = buf.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) {
        clearTimeout(timer);
        resolve(m[0]);
      }
    };
    t.stdout.on('data', onData);
    t.stderr.on('data', onData);
    t.on('exit', () => resolve(null));
  });
}

step('Opening a Cloudflare tunnel so Twilio and your phone can reach this laptop');
const publicUrl = await startTunnel();
if (!publicUrl) {
  console.log(`
  ${c.yellow('!')} Couldn't start a tunnel. Install cloudflared, then run this again:
      macOS:   brew install cloudflared
      Windows: winget install --id Cloudflare.cloudflared
      Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  ${c.dim('Continuing without it: the app works on this laptop and your Wi-Fi in demo mode, but real calls need the tunnel.')}`);
} else {
  console.log(`  ${c.green('✓')} ${publicUrl}`);
}

// ── 4. Server ───────────────────────────────────────────────────────────────
step('Starting the CallBridge server');
const server = spawn('npm', ['run', 'start', '-w', 'server', '--silent'], {
  cwd: root,
  shell: isWin,
  // Environment wins over .env, so the fresh tunnel URL replaces any old value.
  env: { ...process.env, PORT: String(PORT), PUBLIC_BASE_URL: publicUrl ?? '', LOG_LEVEL: process.env.LOG_LEVEL ?? 'warn' },
  stdio: ['ignore', 'inherit', 'inherit'],
});
children.push(server);
server.on('exit', (code) => {
  console.log(c.red(`\nServer stopped (exit ${code}).`));
  shutdown(code ?? 1);
});

// Wait for the server to answer.
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`http://localhost:${PORT}/api/health`);
    if (r.ok) break;
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 500));
}

const lan = lanAddress();
const phoneUrl = publicUrl ?? (lan ? `http://${lan}:${PORT}` : `http://localhost:${PORT}`);
console.log(`
${c.green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}
 ${c.bold('CallBridge is running')}

   On this laptop:  ${c.cyan(`http://localhost:${PORT}`)}
   On your phone:   ${c.cyan(phoneUrl)}   ${c.dim('(scan the QR code)')}
   Sign in:         with your phone number${env.TWILIO_VERIFY_SERVICE_SID && env.AUTH_CODES !== 'log' ? ' (code by text)' : c.yellow(' (test mode: the code appears in this log)')}
   Who can join:    ${env.SIGNUP_ALLOWLIST ? env.SIGNUP_ALLOWLIST : c.yellow('anyone with the link (set SIGNUP_ALLOWLIST)')}
`);
try {
  const { default: qr } = await import('qrcode-terminal');
  qr.generate(phoneUrl, { small: true }, (code) => console.log(code.replace(/^/gm, '   ')));
} catch {
  /* QR code is optional */
}
console.log(`   ${c.bold('Test call:')} sign in, tell the assistant who to call${env.ALLOWED_DESTINATIONS ? ` (allowed: ${env.ALLOWED_DESTINATIONS})` : ''},
   answer on your phone and play the other side.
${publicUrl ? c.dim('   The tunnel URL changes each run; nothing to update, this script handles it.') : ''}
   ${c.dim('Ctrl+C to stop.')}
${c.green('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}
`);
