# CallBridge: a translator on your phone calls

You call someone yourself, in the app. CallBridge shows **live captions** of both sides, each translated into the other's language. When the other person agrees, you can add an **AI interpreter**: it tells both sides it's an AI, then speaks each side's words in the other's language. The AI never talks for you.

```
App ──HTTP──▶ Node + TypeScript server ──REST──▶ Twilio ──PSTN──▶ 📞 them
 │                 │   ▲                           │
 └─ your leg ──────┼───┴── Media Streams (μ-law) ◀─┘  (your phone or the app, and theirs)
                   │
                   └─WebSocket──▶ OpenAI gpt-realtime-translate (one stream per direction)
```

**How a call runs:** your leg connects first (the app via the Twilio Voice SDK, or the server rings your phone), then the server dials them and relays the audio between you. Captions come from two live translation streams, one per direction. The interpreter mixes the translated speech into each line, with the original voice turned down underneath.

---

## Run it on your laptop (fastest way to test)

```bash
brew install cloudflared      # once (Windows: winget install --id Cloudflare.cloudflared)
npm install                   # once
npm run laptop
```

On the first run it asks for your OpenAI key, Twilio SID, auth token and number, and your own mobile number, which is the only number allowed for test calls. It saves them to `.env`, with that number as the only one allowed to sign up (`SIGNUP_ALLOWLIST`). Each run then:

1. builds the app;
2. opens a free Cloudflare quick tunnel (`https://<random>.trycloudflare.com`, no account needed) and points the server at it, so Twilio can reach your laptop;
3. starts the server and prints the phone URL as a **QR code**.

Scan the QR code and sign in with your phone number: with `AUTH_CODES=log` the 6-digit code is printed in the terminal; with Twilio Verify it's texted. Set your name and languages, then pick someone to call. Your phone rings first; answer it, and the app dials them. Ctrl+C stops everything.

### Keep it running (macOS background service)

`npm run laptop` stops when its terminal closes. To keep the server and tunnel up without a terminal (starts at login, restarts within seconds if it stops):

```bash
npm run service:install    # install and start
npm run service:status     # running? does the public URL answer?
npm run service:restart    # after pulling new server code
npm run service:logs       # follow ~/Library/Logs/CallBridge/server.log
npm run service:uninstall  # stop and remove
```

The Mac still has to be on, awake and online; for testers outside your own devices, move the server to real hosting.

## Hosting on Cloudflare (byte2bite.tech)

**Current laptop setup (permanent address):** `npm run laptop` serves the app and API at `https://callbridge.byte2bite.tech` through a named tunnel (`CLOUDFLARE_TUNNEL=callbridge`). It was set up once with `cloudflared tunnel login`, `cloudflared tunnel create callbridge`, and `cloudflared tunnel route dns callbridge callbridge.byte2bite.tech`. Because restaurant-sites holds the Worker routes `*.byte2bite.tech/*` and `*/*`, the zone also has a Worker route `callbridge.byte2bite.tech/*` with **no Worker**, so that one hostname reaches the tunnel (the most specific route wins). Don't delete that route.


| Piece | URL | Runs on |
| --- | --- | --- |
| Web app (phone UI) | `https://callbridge.byte2bite.tech` | Cloudflare Pages: static, always up, rebuilt on every push |
| Call server (API, Twilio webhooks, live audio) | `https://callbridge-api.byte2bite.tech` | Your machine (or any server) through a Cloudflare Tunnel |

The call server needs a long-running Node process that holds the phone audio stream open, so it can't run on Pages. The tunnel gives it a permanent HTTPS address on your domain without opening ports, replacing ngrok. The API host is `callbridge-api`, not `api.callbridge`, because Cloudflare's free certificate covers only one subdomain level.

### 1. Web app on Cloudflare Pages (one-time)

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → choose `LeoYang2001/Callbridge-`.
2. **Production branch:** `claude/ai-phone-assistant-mvp-kmdkvx` (the repo's current default branch).
3. **Build settings:** Framework preset *None* · Build command `npm run build -w web` · Build output directory `web/dist` · Root directory empty. The Node version comes from `.node-version`.
4. **Environment variable:** `VITE_DEFAULT_SERVER_URL` = `https://callbridge-api.byte2bite.tech`
5. **Save and Deploy.** Then open the project → **Custom domains → Set up a custom domain** → `callbridge.byte2bite.tech`. The domain is already on Cloudflare, so the DNS record is created for you.

After that, every push rebuilds the site. Other branches get preview URLs on `*.pages.dev`.

### 2. Call server through a Cloudflare Tunnel

On the machine that runs the server (install `cloudflared` first, e.g. `brew install cloudflared`):

```bash
cloudflared tunnel login                     # choose byte2bite.tech
cloudflared tunnel create callbridge         # prints the tunnel ID and writes a credentials file
cloudflared tunnel route dns callbridge callbridge-api.byte2bite.tech
cp deploy/cloudflared/config.example.yml ~/.cloudflared/config.yml   # fill in the tunnel ID and credentials path
```

In `.env`, set `PUBLIC_BASE_URL=https://callbridge-api.byte2bite.tech`, `CORS_ORIGINS=https://callbridge.byte2bite.tech`, `SIGNUP_ALLOWLIST`, `AUTH_CODES=verify` with `TWILIO_VERIFY_SERVICE_SID`, plus the Twilio and OpenAI keys. Then:

```bash
npm run build && npm start        # terminal 1: the server on :3000
cloudflared tunnel run callbridge # terminal 2: the tunnel
```

To check it from anywhere, open `https://callbridge-api.byte2bite.tech/api/health`, which should return `{"ok":true,…}`. To keep the tunnel running after reboots, use `sudo cloudflared service install`.

**Cloudflare settings that can break calls:**
- **Bot Fight Mode** (Security → Bots) can challenge Twilio's webhook requests, leaving calls stuck at *Dialing*. Turn it off, or add a WAF custom rule that skips security checks for hostname `callbridge-api.byte2bite.tech` with a path starting `/twilio/`.
- **Don't put Cloudflare Access in front of `callbridge-api`.** Twilio can't sign in. The API is protected by phone sign-in sessions, and the Twilio routes by signatures and per-call tokens.
- **WebSockets** (Network tab) must stay on. It's on by default.

For a quick test without DNS setup, `cloudflared tunnel --url http://localhost:3000` gives a temporary `*.trycloudflare.com` URL. Put it in `PUBLIC_BASE_URL` and in the app's Settings.

### 3. On your phone

1. Open `https://callbridge.byte2bite.tech`. In Safari, use *Share → Add to Home Screen* to install it like an app (Android: *Install app*).
2. Sign in with your phone number.

GitHub Pages is still available as a fallback (`.github/workflows/pages.yml`, run manually from the Actions tab). It serves the UI at `https://leoyang2001.github.io/Callbridge-/`; enter the server URL in Settings.

## Quick start

### Prerequisites

- Node.js 20+
- A **Twilio** account with a voice-capable phone number. Trial accounts can only call verified numbers, and they play a trial notice before connecting.
- An **OpenAI** API key with access to `gpt-realtime-translate`
- A public HTTPS tunnel to your machine: Cloudflare Tunnel (see above) or [ngrok](https://ngrok.com/) (`ngrok http 3000`)

### Run

```bash
npm install
cp .env.example .env        # fill in Twilio + OpenAI keys, PUBLIC_BASE_URL, ALLOWED_DESTINATIONS
npm run dev                 # server on :3000, UI on http://localhost:5173
```

You don't need to configure any webhook in the Twilio console. Each call passes its own TwiML and status-callback URL.

For a single-process setup (for example, behind the tunnel), run `npm run build && npm start` and open `PUBLIC_BASE_URL`.

**Accounts:** users sign in with their phone number only (a 6-digit code by SMS through Twilio Verify, or printed in the server log with `AUTH_CODES=log` for testing). The app sends the session as `Authorization: Bearer …`; every `/api/*` route except sign-in requires it, and users only see their own calls. **Set `SIGNUP_ALLOWLIST` whenever the server is reachable from the internet,** otherwise anyone with the URL can sign up and place calls on your account. Profiles, sessions (stored hashed), and call history live in SQLite (`DATABASE_FILE`). The static UI holds no secrets and loads without signing in. Cross-origin requests are allowed from any `https://*.github.io` or `*.pages.dev` origin and localhost by default; add your own domain with `CORS_ORIGINS` (e.g. `https://callbridge.byte2bite.tech`).

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Server (tsx watch) and Vite dev server with `/api` proxy |
| `npm test` | Unit tests, including a translated call end to end with fake providers |
| `npm run typecheck` | Type-checks server and web |
| `npm run build` / `npm start` | Builds the UI; the server then serves it on `PORT` |

---

## Code map

| Where | What |
| --- | --- |
| `server/src/calls/translatedCall.ts` | One call: your leg, their leg, the audio relay, captions, the interpreter (announcement, Ask for me, mixing) |
| `server/src/calls/translatedCallManager.ts` | Starts calls (allowlist, blocked numbers, one call per user, hourly limit), routes Twilio's media to them |
| `server/src/providers/translation/liveTranslation.ts` | One direction of OpenAI's live translation; converts 8 kHz μ-law ↔ 24 kHz PCM |
| `server/src/providers/translation/announce.ts` | The interpreter's spoken notices (text-to-speech for the phone line) |
| `server/src/audio/pcm.ts` | μ-law, resampling, and mixing translated speech into a line |
| `server/src/calls/captions.ts` | Turns streaming text into caption lines that pair what was said with its translation |
| `server/src/routes/` | Sign-in and profile, call API, Twilio webhooks and media streams |
| `web/src/Translator.tsx`, `mobile/src/app/index.tsx`, `mobile/src/app/translate/[id].tsx` | The dialer and the live call screen |

## Logging and privacy

- **Logged:** call lifecycle events (connected, translation started, interpreter on/off, ended) and errors. **Not logged:** audio, captions, request bodies, auth headers, or Twilio signatures.
- **Saved:** finished calls with their captions, in the user's history (they can delete each one, or the account). No audio is recorded.
- **Consent:** the interpreter announces itself to both sides, and the app asks the user to get the other side's OK first. **Captions-only calls transcribe the other person without telling them;** in all-party-consent states (CA, FL, WA, PA, IL, …) tell them, or add an announcement, before launch.

## Known limitations

- **Interpreter voices:** the translation model speaks 13 languages (English, Spanish, Portuguese, French, German, Italian, Russian, Chinese, Japanese, Korean, Hindi, Indonesian, Vietnamese). Others, Tagalog included, can't have the interpreter; whether captions work for them is untested.
- **Caption pairing** is a heuristic: a pause starts a new line, and the translation fills the oldest line still waiting for one.
- **One process, in memory:** a restart drops calls in progress (finished ones are in SQLite).

## Caller ID: one number for every user, or the user's own

**Today every user's calls come from one CallBridge number** (+1 651-650-4528). That works for many users at once: one Twilio number can carry many calls in parallel (Twilio's default limit is about one new outbound call per second per account, which can be raised). What has to be handled as usage grows:

- **Callbacks.** Nobody answers that number today; a business calling back reaches nothing. Fix: an inbound handler that looks up who last called the caller's number and forwards the call to that user (or takes a message and notifies them).
- **Spam labels.** One number calling many businesses for many users will likely get labeled "Spam Likely" by carriers. Mitigations: a Twilio Business Profile for SHAKEN/STIR "A" attestation and a registered caller name (CNAM "CallBridge"), a pool of local numbers with a cap per number, and watching answer rates.
- **Recognition.** Friends and family don't know the CallBridge number, so iPhones screen the call (as happened on the first personal calls).

**The alternative is the user's own number as caller ID.** Each user verifies their number once (Twilio calls it with a code, about a cent). Their calls then show their own number, callbacks reach them directly, and friends recognize it. The user is really on the call, so the caller ID is truthful. Limits: each number must be verified, and a user can't call their own number this way (it returns busy).

**Recommended:** the shared number for businesses, with callback forwarding, plus an opt-in "Call from my number" (best for personal calls). The account owner is the caller of record for every call either way (see the checklist below).

## Before production: compliance checklist

CallBridge is for calls the user makes themselves. Before launch, get legal review of:

- **Recording and transcription consent** in all-party-consent states, for captions as well as the interpreter.
- **AI disclosure:** the interpreter announces itself; check state AI-voice laws for anything more.
- **Privacy:** what's retained (captions), for how long, and data-processing terms with Twilio and OpenAI.
- **Caller ID:** a number the other side can call back, or the user's own verified number.
