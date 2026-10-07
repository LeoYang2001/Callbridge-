# Handoff: get the first real CallBridge call working

You are picking this up in a Claude Code session that runs **on the user's laptop** (macOS) in the `Callbridge-` repo. The previous session ran in a cloud sandbox: it could write and test code but could not reach Twilio, OpenAI, Cloudflare, or the laptop. Everything below is pushed on branch `claude/ai-phone-assistant-mvp-kmdkvx`, which is the repo's default branch.

## Goal right now

Place one real test call end to end:

1. The user starts a call from their phone.
2. Twilio calls the user's own mobile number.
3. The AI introduces itself and holds the conversation.
4. The result screen shows the transcript and a structured result.

Then work through the acceptance checklist in `README.md` → *Running the Phase 0 acceptance test*.

## Where things stand

- **Code:** Phase 0 is complete. CI passes on GitHub (typecheck, 28 tests, build).
- **Laptop:** `.env` exists, created by `npm run laptop`. It holds the OpenAI key, Twilio Account SID and Auth Token, `ALLOWED_DESTINATIONS` (the user's verified mobile), and `APP_PASSWORD`. **Never print secret values from `.env`.**
- **Tooling:** `cloudflared` is installed (via brew); the quick tunnel worked.
- **Twilio account:** the user **just upgraded it from the Limited trial**. They probably don't own a voice number yet. `TWILIO_FROM_NUMBER` in `.env` may still be an old trial number.
- **Remaining blocker:** a valid `TWILIO_FROM_NUMBER`, then the first real call.

### What already happened (so you don't repeat it)

| Symptom | Cause | Status |
| --- | --- | --- |
| "not on the allowlist" | Number typed without `+1` | Fixed: numbers are normalized |
| Settings "Not Found" | Browser autofilled `admin` into Server URL | Fixed: autofill blocked, bad values ignored |
| "trial accounts have limited parameter access" | Limited trial rejects some `calls.create` options | Code falls back through simpler setups (`server/src/providers/telephony/twilio.ts`) |
| "No Twilio trial phone number is assigned … add the 'to' number as a verified recipient" | Trial account restrictions | Moot after the upgrade |

## Do this

1. **Update the code:** `git pull`.
2. **Get a number:** `npm run twilio:setup`. It's interactive and **asks y/N before buying a number** (about $1.15/month), so let the user answer or ask them before you confirm. It:
   - checks the account type is `Full`;
   - reuses an owned voice number, or buys a US local one, trying the test phone's area code first;
   - writes `TWILIO_FROM_NUMBER` into `.env`.

   If it still says *Trial*, wait a minute and rerun.
3. **Start the stack:** `npm run laptop`. It's long-running, so run it in the background and keep reading its output. It:
   - builds the web app;
   - opens a `*.trycloudflare.com` quick tunnel and sets `PUBLIC_BASE_URL` from it on every run;
   - starts the server on :3000 (it doesn't open a browser);
   - prints the phone URL, the access key and a QR code.

   The QR code encodes `<tunnel>/#key=<APP_PASSWORD>`. Give the user that URL or tell them to scan the QR; opening it saves the access key and connects the app automatically.
4. **User places the call:** on the phone, enter their own number (it must be in `ALLOWED_DESTINATIONS`) → Next → Next → check the consent box → **Start call** → answer.
5. **Watch and debug:**
   - Server logs (level `warn` by default in `npm run laptop`). Set `LOG_LEVEL=info` for per-call events.
   - `GET /api/calls` and `GET /api/calls/:id` with `Authorization: Bearer $APP_PASSWORD`.
   - `data/calls/<id>.json`, written when a call finishes: the full record with transcript, policy decisions, metrics and event log.
   - In the app: result screen → **Developer details** → event log.

### Reading the event log

Expected order: `ai.connected` → `call.status dialing` → `telephony.call_created` → `telephony.status ringing/answered` → `media.started` → `ai.tool_call …` → `ai.end_call` → `telephony.hangup` → `call.ended` → `analysis.done` → `call.finished completed`.

| Symptom | Likely cause / where to look |
| --- | --- |
| Fails before dialing with `OpenAI Realtime refused the connection (HTTP 401/403/404)` | OpenAI key or billing, or no access to `gpt-realtime-2.1`. Try `REALTIME_MODEL=gpt-realtime-2.1-mini` or `gpt-realtime` in `.env`. |
| `answered` but no `media.started` | Twilio can't open `wss://<tunnel>/twilio/media`. Check the tunnel is up, and look for warnings about the signature or stream token in the server log. |
| Twilio webhooks get 403 | Signature check uses `PUBLIC_BASE_URL + path`, so the tunnel URL must match exactly. For debugging only: `TWILIO_VALIDATE_SIGNATURES=false`. |
| `media.started` but the AI is silent | Look for `ai.error` / `ai.fatal_error`. `audio/pcmu` both ways and session config are in `server/src/providers/voice/openaiRealtime.ts`. |
| AI talks over people or cuts off | VAD settings: `REALTIME_TURN_DETECTION=server_vad` vs `semantic_vad`. |
| Result missing or "analysis failed" | `ANALYSIS_MODEL` (default `gpt-5.4-mini`, Responses API with `json_schema`). Try another model the key has access to. |

Verify every API detail against the installed SDKs: `node_modules/openai/resources/realtime/*.d.ts` and `node_modules/twilio`. The cloud session couldn't open the OpenAI or Twilio docs, so the code was checked only against SDK type definitions and has **never run against the live APIs**. Expect small fixes on the first real call. That is the main thing left to verify.

## Rules to keep

- **Product principle:** the LLM is not the authority. Commitments, charges and sensitive data go through `server/src/policy/*` and the tools in `server/src/agent/tools.ts`. Don't move enforcement into the prompt.
- **Before any change:** `npm run typecheck && npm test && npm run build`.
- **Git:** commit to `claude/ai-phone-assistant-mvp-kmdkvx` and push. Don't open PRs unless asked.
- **Never commit `.env`** (it's gitignored) or print its secrets.
- **Testing:** test calls go only to numbers in `ALLOWED_DESTINATIONS`. No call recording, no bulk dialing.
- **Spending:** ask the user before anything that spends money (buying numbers, upgrades).

## Map

| Path | What |
| --- | --- |
| `scripts/laptop.mjs` | One-command local run: env setup, build, tunnel, server, QR |
| `scripts/twilio-setup.mjs` | Account check, buy or reuse a number, write `.env` |
| `server/src/calls/callSession.ts` | Per-call orchestrator: audio bridge, barge-in, tools, hangup, status polling, result merge |
| `server/src/providers/telephony/twilio.ts` | Twilio calls (with trial fallbacks) and the media-stream transport |
| `server/src/providers/voice/openaiRealtime.ts` | OpenAI Realtime WebSocket client (GA event names) |
| `server/src/providers/analysis/openaiAnalyzer.ts` | Post-call structured extraction |
| `server/src/policy/` | Authorization levels, availability checks, sensitive-data screen |
| `server/src/agent/prompt.ts`, `tools.ts` | System instructions and tool schemas |
| `web/src/` | Mobile-first UI: `NewCall`, `CallScreen`, `SettingsSheet`, demo simulator in `demo.ts` |
| `README.md` | Setup, acceptance test, architecture, Cloudflare hosting, compliance checklist |

## After the first successful call

1. Run the README acceptance checklist and fix what fails. Prompt tuning goes in `server/src/agent/prompt.ts`; tests go in `server/test/`.
2. Optional: permanent hosting on the user's domain `byte2bite.tech`. Use Cloudflare Pages for the app (`callbridge.byte2bite.tech`) and a named Cloudflare Tunnel for the server (`callbridge-api.byte2bite.tech`). See README → *Hosting on Cloudflare*.
3. Next feature: Phase 0.2, human in the loop (README → *Next: Phase 0.2*). Only start it once calls work reliably.
