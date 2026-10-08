# Handoff: CallBridge mobile app (edge-glow UI)

## Overview
CallBridge is an AI phone assistant: the user says (in their own language, e.g. Mandarin) who to call and why; the assistant places the call in the other party's language, puts them on hold to ask the user quick questions, and reports the result. This package covers the full mobile app UI: onboarding, requesting a call (push-to-talk), lookup, review, ringing, live call + hold questions, results, talk-it-over, call history, phone book, settings, plus the Dynamic Island / Live Activity / in-app capsule designs.

Source repo the web client lives in: `LeoYang2001/Callbridge-` (branch `claude/ai-phone-assistant-mvp-kmdkvx`). Data shapes in `shared/types.ts` there should drive the real models.

## About the design files
The files in this bundle are **design references created in HTML**, prototypes showing intended look and behavior. They are **not production code to copy**. Recreate them in the target environment (recommended: **SwiftUI** for iOS, since Live Activities/Dynamic Island require ActivityKit + WidgetKit; or React Native/Expo if the team prefers JS, with a native widget extension for Live Activities). Use the codebase's patterns; if none exist, choose the most appropriate framework.

Open `CallBridge App.dc.html` in a browser (keep `support.js` and `callbridge-data.js` beside it). The left rail jumps to any screen; the caption under the phone explains the glow on each screen.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii, copy and motion are final for v1. Recreate pixel-accurately at a 390×844 pt reference (iPhone 14/15). Copy in Mandarin is demo content produced by the assistant; UI chrome labels are English for v1.

## Global layout
- Reference frame 390×844 pt, device corner radius 56. Status bar 54 pt. Home indicator 134×5, bottom 8.
- Content side padding: 20–34 pt (hero text 34 pt, cards 14–22 pt).
- **No bottom tab bar.** Top-level screens (Call/Home, Calls, Phone book, Me) show a 40 pt round **menu button** top-right (bg `rgba(18,20,24,.05)`, two-line icon: long line + short line). It opens a **full-screen menu** (see Navigation).
- While a call is active and the user is on any screen other than Live/Ringing/Lock, a **black in-app call capsule** pins under the status bar (see In-app capsule).

## The edge-glow system (core visual language)
Light wraps the inner edge of the screen; its type, color and tempo encode state. Implemented as stacked bands around the screen edge: wide blurred band + medium band + crisp 3 pt line, each a masked ring (`padding` = band width, mask = content-box XOR border-box) filled with a slowly rotating conic gradient, or a flat linear gradient for static glows. Render behind content (z below all UI).

| Key | Used on | Bands (width / blur / opacity) | Colors | Motion |
|---|---|---|---|---|
| idle | Home, research results, menu | 30/26/.5 + 3/0/.5 | aura palette | rotate 14 s, breathe 4 s |
| listen | user holding the talk button | 34/26/1 + 10/8/.9 + 3/0/.9 | aura | rotate 12 s, breathe 3.2 s |
| speak | assistant speaking (≈2.4 s after each question) | 44/30 + 12/8 + 3 | aura | rotate 5 s, breathe 1.3 s |
| think | looking it up | 30/26/.55 + 2.5/0/.7 | flat violet `#b59cff` | breathe 2.2 s, **no rotation** |
| ready | Review & confirm | 14/14/.6 + 3 | `#5cc8ff,#2557e8,#b59cff` | rotate 22 s |
| ring | Ringing | 20/16 + 3 | hairline palette | opacity pulse 1.5 s (0.12→1) |
| hair | Live call | 14/14/.7 + 3 | `#7fe0a3,#1a9e4b,#5cc8ff` | rotate 16 s |
| msg | messaging the assistant mid-call | hair + bottom band 70/36 linear-gradient(0deg, #5cc8ff, #2557e8 12%, transparent 34%) | — | breathe 2.4 s |
| hold | hold question | violet tint band 40/30/.35 + SVG stroke around the screen rect (rx 54) whose dash length = remaining/total; 26 pt blurred + 6 pt crisp | `#d89bff → #5b3cc4` | dash shrinks 1 s linear per tick (edge **is** the countdown) |
| done | Result success/delivered/info | 44/32 + 10/8 + 3 | `#e3ffe9,#7fe0a3,#1a9e4b,#5cc8ff` | rotate 14 s, breathe 4 s |
| fail | Result no answer | 12/12/.5 + 2.5 | amber `#f3c45c → #d48a00` | static |

Aura palette: `#5cc8ff, #2557e8, #b59cff, #7fe0a3, #5cc8ff`. Glow switches cross-fade 0.6 s. Provide a reduce-motion path (static bands, no rotate/breathe).

Rule of thumb: **aura = the assistant is talking with you; hairline = a phone line is involved; color = who's involved (blue assistant, green other party/success, violet waiting on you, amber didn't work); tempo = urgency.**

> Note: The Live Activity brief specifies **amber** for "needs you". In-app hold UI currently uses violet `#5b3cc4`. Decide one; recommendation: switch in-app hold to amber for consistency.

## Push-to-talk (cost constraint)
No always-on listening. The assistant listens **only while the user holds** the talk button.
- Button: 84 pt circle (104 on Home), `#2557e8`, mic icon; label below "Hold to talk".
- Pointer down: scale 1.12 (180 ms), bg `#1a3fb0`, shadow rings `0 0 0 14px rgba(37,87,232,.18), 0 0 0 30px rgba(37,87,232,.07)`, label "Release to send", glow → listen, mic indicator "Mic on" (red dot `#e5402f`).
- Release: send audio; transcript finalizes; glow → idle; assistant replies (glow speak for reply duration) then returns to "YOUR TURN · HOLD TO ANSWER" (grey label, mic off).
- Quick tap (<350 ms): toast "Hold the button while you speak".
- Partial transcript shows live while holding (dashed blue bubble for short answers; big 31 pt text on the Listening screen).
- Every voice question also offers tappable answer chips (44 pt pills, white, 1 px `#e1e4e9` ring, hover 2 px `#2557e8`).
- Live calls are unchanged (the assistant is the speaker there).

## Screens
Copy, exact strings and scripted data live in `callbridge-data.js` (`info`, `lines`, `buildResult`, `talkSetup`, `talkReply`, contacts, places, rail captions).

1. **Sign in**: wordmark (36 pt blue rounded square + "CallBridge"), headline "Call anyone,\nin your language." 36/600, sub 15 pt `#69707d`. Phone field 56 pt tall, r18, bg `#f4f5f7`, mono 17. Continue: 56 pt black pill. English only (no profile yet).
2. **Code**: "Enter the code" 30/600; six 60 pt boxes r14, active box 2 pt blue ring; auto-fill from SMS → Profile interview.
3. **Profile interview**:
   - Step 1 **language picker (no voice, no glow)**: globe icon, "Choose your language" 30/600, sub "选择语言 · Elige tu idioma". Search field 50 pt r16 `#f4f5f7` (placeholder "Search · 搜索 · Buscar", matches native or English name). Scrollable list of 30 languages, rows ≥62 pt r18 white, native name 20/600 left, English name 13 right. Footer "You can change this later in Me."
   - Steps 2–4 by voice in the chosen language (English underneath when not English): name → voice (Marin/Cedar) → general purpose ("What will you mostly use CallBridge for? I can call to book, ask questions, or pass on a message." chips: Daily errands / Work & business / Family & friends / Something else). Progress: 4 segments 3 pt. Pill top-right "Language · 中文" (nowrap). Answers accumulate as blue pills. Done → "Start calling" 56 pt blue.
4. **Home (Call)**: greeting 15 grey + "想打给谁？" 30/600; centered 104 pt hold-to-talk; hint "The mic stays off until you hold. Or tap a suggestion."; suggestion chips (38 pt r19 `#f4f5f7`); upcoming card (date block THU/8 in `#b42318`).
5. **Listening**: shown while holding. Label (bars + "LISTENING · RELEASE TO SEND" blue / "GOT IT" green). Transcript 31/500 with blue caret; English 14 grey after finalize.
6. **Assistant asks**: label SPEAKING (violet bars) → YOUR TURN; question 30/500; English 14; chips; request card (name, "n of 5 details", 5 progress segments blue/`#e1e4e9`, need-to-know in violet). Bottom: speaker · hold button · mic-state.
7. **Looking it up**: user bubble; radar (3 violet rings `#8b6cf0` scaling .45→1.7 over 2.1 s staggered .7 s; 58 pt violet disc with magnifier); found place names pop in as white pills around it; 4-step list (done = green check disc, current = spinner ring `#e4dcff/#5b3cc4`, pending = grey dot at 40% opacity), each zh + en. ~3.2 s then results: assistant note + place cards (name 15/600, distance, open/rating/lang, mono number, "Unverified number" amber pill when sourced from a web page). Tap card → Assistant asks to confirm.
8. **Review & confirm**: "确认这通电话"; details card rows (Calling / Number mono / Speaks / Goal zh+en / Extra charges), labels nowrap; segmented Stay in the loop | Hand it off; disclosure copy changes per mode; "Call now" 58 pt green `#1a9e4b`.
9. **Ringing**: "RINGING · n" green, name 38/600, mono number, disclosure zh+en, Cancel (70 pt red `#e5402f`). No answer after 6 rings → Result: no answer.
10. **Live call**: header Leave · name + "In progress · mm:ss" green · —; 7-segment progress; previous line grey 14; latest line label (THEM green / AI FOR WEI blue), quote 28/500, original-language line 15 grey. Mode row + Transcript. Controls: Listen (toggle), End call (70 pt red), Message.
    - **Message the assistant**: composer with private note chips ("让他们说慢一点", "问问有没有更早的时间", "可以结束了"); notes appear as dashed blue bubbles, "Private · they can't hear this". The assistant acts on them in the next turn.
    - **Transcript sheet**: from top 110 pt, r30 top, bubbles (them grey left, AI blue right, your notes dashed).
11. **Hold question** (Stay in the loop only): label "THEY'RE ON HOLD FOR YOU", countdown 64/200 violet, question 26/600, original 14, chips ($80 / Over your limit), Approve (violet 54 pt) / Decline / 下次再说. Timeout (default 30 s, configurable) → assistant says the user will follow up. In Hand-it-off mode the assistant declines politely instead of asking.
12. **Result**: label (BOOKED green / NO ANSWER amber / ANSWERED blue / DELIVERED blue / UPDATED green), headline 40/600, English 15, bullets with colored dots. Success: primary black pill (Add to calendar / Get directions / Done) + Talk it over + Transcript. No answer: "Try again at 11:00", alternate place, Talk it over.
13. **Talk it over**: summary card; chat bubbles (user blue right r20 20 6 20, assistant white left); suggestion chips; can produce a **Follow-up call card** (blue 1.5 pt ring, "Asks only …", extra charges, Review & call). Hold-to-talk composer.
14. **Calls**: Upcoming horizontal cards (200 pt), Recent list (name, time, Mandarin headline, status pill: Booked `#e1f5e8/#137a3a`, No answer `#eef0f3/#69707d`, Delivered `#e6edfd/#2557e8`, Not booked `#fdeceb/#b42318`). Tap → Result (read-only).
15. **Phone book**: title + Import; live search (name/relationship/number); rows: 42 pt avatar, name + relationship pill, meta "number · language · n calls", last outcome; green call button (starts flow with contact pre-filled).
16. **Contact**: avatar 84, name 26/600, relationship pill, "Call with the assistant" green, info rows, Last call (green card), Learned on calls (zh + en), Delete.
17. **Import**: after the OS picker; choose number when several (radio rows), relationship + call language, duplicate warning card (amber ring) "Update existing / Skip"; CTA "Add 2 · Update 1".
18. **Me**: profile, language/voice/default mode/charges, "The assistant may share" toggles (51×31, on `#1a9e4b`), note "Card numbers, SSN, passwords and account numbers are never shared.", Notifications, Sign out.
19. **Notifications**: Hold questions "Always on" (violet pill), toggles for results/reminders/Live Activity, "Preview a hold question on the lock screen".
20. **Lock screen (prototype)**: Live Activity card with violet glow ring; see Live Activity file for final specs.

### Navigation (full-screen menu)
Overlay `rgba(255,255,255,.97)` + idle glow. Top row: "李伟 · Mandarin" left, 40 pt close (X) right in same position as menu button. Vertical items centered: Call / Calls / Phone book / Me at 40/600, -0.02em, Chinese label right 15 grey, 1 px `#eef0f3` dividers; current item `#2557e8`. Items enter with fade-up 350 ms staggered 50 ms. Bottom: live call row (green) when active; links Notifications · Import contacts.

### In-app call capsule
iOS hides your own Live Activity from the Dynamic Island while your app is foregrounded, so CallBridge shows its own capsule under the status bar (never touching the island). 46 pt black pill r23, padding 0 14 0 16, gap 10. States (see `CallBridge Live Activity.dc.html` → "Inside the app"): Connected (blue handset, name, blue timer, chevron) · On hold (grows to r28 card: pulsing amber dot, "Dentist is on hold", countdown, question, Yes/No/Open) · Finished (green check + headline, auto-collapses ~6 s) · Errand batch (list glyph, current call, "1 needs you" amber pill only when relevant, "2/4", 2 pt progress line inset 23 pt).

## Dynamic Island / Live Activity
See `CallBridge Live Activity.dc.html`: 9 states + 4 stress tests, each with Compact (leading glyph · ≤8-char trailing), Minimal, Expanded (lead disc 34, eyebrow 13/600 colored, title 17/600 one line or 2-line wrap for questions, trailing system timer, 1–2 lines, up to 2 buttons r22 44 pt), Lock Screen light (card `rgba(255,255,255,.8)` r24) and dark (`rgba(36,36,42,.78)`).
- Colors on black: accent `#7BA6FF`, amber `#FFB020`, green `#4CD97B`, red-orange `#FF6A55`, dim `rgba(255,255,255,.42)`. Light variants: `#2557E8`, `#A35F00`, `#137A3A`, `#C4321F`.
- Auto-expand only: On hold, Finished (success / follow-up), Errand batch finished.
- Only motion: pulse on the amber dot. Timers/countdowns via `Text(timerInterval:)`.
- Buttons Yes/No/Hang up via App Intents (no app launch). Questions needing typing → "Answer in app" primary.
- Glyphs: outline handset (calls), dotted list (errands), filled disc + pause (hold), filled ✓ / ! / ✗.

## Interactions & motion summary
- Screen enter: fade 300 ms. Question/line change: fade-up 8 pt, 350 ms ease.
- Toasts: black pill top 64, 2.2 s.
- Live call script advances every ~2.7 s in the prototype (real app: server events).
- Hold countdown ticks 1 s; edge dash animates 1 s linear.
- Ringing: 3 pulses ≈ 4.4 s before connect in the prototype.

## State (prototype → real app)
`screen`, `flow` (dentist | food | msg | followup), `ctx` (contact, charges, reply), `place`, `mode` (loop | handoff), push-to-talk (`holding`, `holdKind`, partial transcript), `speaking`, call (`callActive`, `callSec`, `tx[]` transcript, queue of incoming events), hold (`holdPending`, `holdSec`, `holdAns`), `msgOpen`, `notes[]`, `result`, `talk[]`, `fu` (follow-up draft), `calls[]`, `contacts[]`, onboarding (`ob`, `obLang`, `obLangName`, `obAns[]`), `menuOpen`. In production these map to server call sessions + websocket events for transcript lines, hold questions and results.

## Design tokens
- Ink `#121418`; secondary `#69707d`; tertiary `#9aa1ad`; body grey `#4a4f5a`.
- Surfaces: white `#ffffff`, `#f4f5f7`, `#f7f8fa`, `#fbfbfd`; dividers `#eef0f3`, `#e1e4e9`, `#d5d9e0`.
- Brand blue `#2557e8` (pressed `#1a3fb0`, tint `#e6edfd`); green `#1a9e4b` / text `#137a3a` / tint `#e1f5e8`; violet `#5b3cc4` / tint `#eee9fc`; amber text `#855600` / tint `#fff3d1` / glow `#f3c45c`; red `#e5402f`, `#b42318`, tint `#fdeceb`.
- Type: Geist (UI), Noto Sans SC (Chinese), Geist Mono (numbers). On iOS use SF Pro + PingFang SC. Scale: 11 / 12 / 12.5 / 13 / 14 / 15 / 16 / 17 / 20 / 22 / 26 / 28 / 30 / 31 / 36 / 40 / 64. Labels: 12/600, +0.08em, uppercase.
- Radii: pills 99; buttons 22–29 (height/2); cards 18–24; sheets 30; device 56.
- Shadows: card ring `0 0 0 1px #eef0f3`; primary mic `0 12px 30px rgba(37,87,232,.28)`; toast `0 10px 30px rgba(0,0,0,.25)`.

## Assets
No raster assets. All icons are simple stroke SVGs (handset, mic, headphones, message, chevron, X, globe, magnifier). Swap for SF Symbols on iOS: `phone`, `mic.fill`, `headphones`, `bubble.left`, `chevron.right`, `xmark`, `globe`, `magnifyingglass`, `list.bullet`, `pause.circle.fill`, `checkmark.circle.fill`, `exclamationmark.circle.fill`.

## Files
- `CallBridge App.dc.html`: the interactive prototype (all screens; the left rail jumps between them; Tweaks: glow palette, animation on/off, hold seconds).
- `callbridge-data.js`: all copy, scripts, contacts, places, result builders.
- `CallBridge Live Activity.dc.html`: Dynamic Island, Lock Screen and in-app capsule spec sheet.
- `reference/CallBridge Mobile (explorations).dc.html`: earlier explorations (orb, edge-glow variants 2a–2f, 3a–3g) for context only.
- `support.js`: runtime needed to open the `.dc.html` files in a browser.
