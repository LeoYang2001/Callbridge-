# CallBridge mobile app: product handoff

**For:** the designer and the mobile engineers.
**What this is:** every feature the mobile app needs, what each screen must show and do, and the states and edge cases to cover. **There is no design language here on purpose.** Layout, navigation pattern, visual style, motion, and iconography are the designer's call. Where this document says "screen", read it as "a place in the app"; it can be a sheet, a tab, a step, or part of another screen.

**Status:** everything below works today in the web test client at callbridge.byte2bite.tech, except items marked **New for mobile**. The server and its API stay the same; the mobile app is a new client for it.

---

## 1. The product in one paragraph

CallBridge makes phone calls for you in another language. You tell its assistant, in your own language, by voice or by typing, who to call and what you need ("call my dentist and book a cleaning next week", "tell Tabito I can't make Bible reading tonight", "call the nearest Mexican restaurant and ask when they close"). It works out the details, looks up anything it needs online, and checks the request against safety rules. You confirm, and an AI places the call in the other person's language, saying up front that it's an AI acting for you. You can follow the call live, read it translated, listen in, and answer the assistant's questions mid-call, or hand the call off completely. Afterwards you get the result in your language, and everything learned (the contact, the appointment, your decisions) is remembered for next time.

**Who it's for:** people who don't speak the local language comfortably (first user: a Mandarin speaker in the US who also calls family and friends in Tagalog and Japanese).

**Languages:** the app talks with the user in their language (Mandarin, Cantonese, Spanish, Vietnamese, Korean, Tagalog, Russian, Arabic, Hindi, Japanese, English…) and calls in any of them. UI chrome can stay English for v1, but all generated content (assistant speech, summaries, translations, rulings, questions) is in the user's language. **Arabic means right-to-left text must render correctly** wherever generated content appears.

---

## 2. Map of the app

1. Sign in (phone number + text code)
2. Profile interview (first launch; redo anytime)
3. Home: start a call by talking or typing
4. Phone book (including import from the phone's contacts, **New for mobile**)
5. Review & confirm a call
6. Live call
7. Result
8. "Talk it over" (follow-up conversation about a finished call)
9. Call history (**New for mobile**: the API exists, the web client has no screen)
10. Profile & privacy
11. Settings
12. Notifications (**New for mobile**)

---

## 3. Sign in

The phone number is the account. No passwords, no email.

**Flow**
1. Enter a mobile number (US first: a fixed +1 and formatting as you type, e.g. (901)-455-3148; pasted or autofilled numbers with +1 are accepted).
2. Choose "I'll speak" language (used for the profile interview and everything generated).
3. "Text me a code": a 6-digit code arrives by SMS. The code field supports OS one-time-code autofill.
4. Enter the code: signed in. A new number creates the account and goes to the profile interview; a returning number goes home.

**States and errors to design**
- Sending… / checking…
- Wrong code ("That code didn't work. Check it, or send a new one."). After 5 wrong tries the code is locked; send a new one.
- Code expired (10 minutes).
- Too many codes requested (rate-limited per number and per network; try again in an hour).
- Invite-only: "CallBridge is invite-only for now, and this number is not on the list."
- Invalid number, or an emergency/premium number.
- Actions: "Send a new code", "Change number".

**Session:** stays signed in for 90 days per device. Sign out and delete account live in Profile. Each code costs the business about $0.05, so the design shouldn't encourage repeated sends.

---

## 4. Profile interview ("Let's get to know you")

A short spoken or typed conversation with the assistant, in the user's language, that fills the profile so later calls need fewer questions. Shown after the first sign-in; can be redone anytime ("Update by talking").

**What it asks, one question at a time, each optional**
1. What to call you (the name the AI uses on calls)
2. Pronouns, only if wanted
3. Languages you speak; which language calls are usually in
4. Time zone / city (prefilled from the phone)
5. When you're usually free (e.g. weekdays after 5 pm)
6. Information the AI may share on calls when relevant (date of birth, home address, insurance provider name, email…). It's shared only when a call needs it, and confirmed per call.
7. Anything else (preferences: "mornings are best", "I'm a patient at Smile Dental")

**Must support**
- Talking and typing in the same conversation, switching freely (the same conversation controls as Home, §5).
- **Skip this question** and **That's all** as one-tap actions, plus saying "skip" in any language.
- A live view of what's been saved so far, updating as the conversation goes.
- **Skip for now** (finish later) and **Done**.
- Sensitive data refusal: card numbers, bank details, SSNs, passwords, and one-time codes are never stored. The assistant stops the user and explains; the server also rejects them, and the UI should show that the item wasn't saved.

---

## 5. Home: start a call

The main screen. One conversation with the assistant that ends in a ready-to-confirm call.

**The conversation**
- Voice: a mic control that starts the conversation and then toggles the mic on/off without ending it. Mic permission is asked on first use.
- Typing: a text field into the **same** conversation (typing never restarts anything; you can start by typing and never use the mic).
- Assistant speaks back (voice) and its words appear as text. A sound on/off control mutes the voice but keeps the text.
- One-tap **Skip this question** and **That's all**.
- **End** the conversation without calling.
- Status to communicate: connecting · listening · thinking · looking it up (research: ~10 s quick, ~30–40 s thorough; the assistant says when it'll take a moment) · speaking · mic off · disconnected (with retry).
- Choosers before or during: **language I'll speak**; **voice** of the assistant (10 voices; two are marked most natural). The same voice is used for the call.

**What the assistant gathers, always in this order**
1. **Who to call.** The number is found in this order, never asked if it can be found:
   a. the phone book, by name or by relationship in any language ("my gf", "女朋友", "my dentist"); it just confirms ("Maria, your girlfriend, at 747-283-6440?").
   b. online research for a kind of place or an unknown business ("the nearest Mexican restaurant", "a body shop that takes Geico");
   c. asking for the number (read back digit by digit).
2. **Why**: the purpose (for a personal message, the message itself).
3. A short questionnaire tailored to the kind of call, only what's missing, each skippable, e.g. clinic: who it's for, new/existing patient, reason, times, what may be shared; restaurant: party size, times, name; personal message: just confirm wording and language.
4. Call language (defaults to the contact's last language, else the user's usual call language).

**Live request card** (fills in as the conversation goes): who (name, relationship), number, task in the user's language, call language, the ruling (below), what's still missing.

**Research results** (from 1b, or any fact the assistant looks up):
- A short answer in the user's language, with sources.
- Up to 5 places to call, each with name, distance, open now, rating, why it fits ("open now, takes Geico"), address, number, and "in your phone book as …".
- **Unverified** marker on numbers that came from a web page (the assistant also reads them back). Tapping a place picks it.
- Location permission is asked the first time a "near me" question needs it; if denied, the assistant asks for a city or zip.

**Same names:** if more than one contact or place fits (two Marias; two locations of a chain), the assistant asks which one, by relationship, street, distance, or last 4 digits. The UI should make the options easy to tell apart.

**Ground-rules ruling** (shown on the card, in the user's language):
- **Allowed**: appointments, reservations, service visits, questions to businesses.
- **Allowed with limits**: doctor/dentist/pharmacy (scheduling and status only); personal messages to people you know (the AI delivers the message in your name, ends the call if unwanted).
- **Not allowed**, with the reason: banking/payments, identity verification (insurance claims, government, account changes), legal matters, emergencies ("call 911 yourself"), sales/marketing, anything deceptive, harassing, or pressuring.
- Missing details are listed ("Still needed: …").

**Exits:** **Review & call** (enabled once there's a number and a task; highlighted when the assistant says it's ready) and **Use the form** (manual entry, carrying over what was gathered).

**Starting points into Home:** a contact's "Call" in the phone book (the assistant starts already knowing who, and only asks what for), and "Talk it over" from a result.

---

## 6. Phone book

Everyone the user has called is saved automatically; the user can also add, edit, delete, and import.

**Each contact:** name; relationship (girlfriend, mom, dentist…); number; call language; address (businesses); kind (clinic, restaurant, personal…); notes learned on calls ("asks for the insurance card at check-in"); last call outcome (in the user's language); number of calls.

**Actions:** Call (opens Home with the contact filled in) · Edit · Delete (with confirm) · Add · Search (name, relationship, number).

**Rules:** contacts are unique by number, not by name (two "Maria"s can exist). A name the user sets is kept when later calls update the contact. Adding a duplicate number, an invalid number, or an emergency/premium number is refused with a reason.

**Import from the phone's contacts (New for mobile)**
- Use the OS contact picker so the user picks specific people; only the picked contacts' names and numbers are sent to CallBridge (no whole-address-book upload).
- After picking, let the user set relationship and call language (both optional) and choose which number if a contact has several.
- If the number already exists in the phone book, offer to update rather than duplicate.

---

## 7. Review & confirm

Shown before every call, whether it came from the conversation or the form.

**Shows (all editable):** who and number; task (in the user's language); call language; when the user is available (time windows, required for calls that book a time); extra charges the AI may accept (default none); what it may share on this call (picked from the profile's shareable info or added here); the user's name/pronouns as the AI will use them; voice.

**"During the call"**: a choice before every call, the last choice remembered:
- **Stay in the loop**: if the other side asks for something outside the limits, the AI puts them on hold and asks the user in the app (up to 60 s); the user can also message the AI mid-call.
- **Hand it off completely**: no interruptions; the AI works within the limits, politely declines anything else ("Leo will follow up"), and the user just gets the result.

**Consent:** a confirmation that the user is asking for this call themselves, to a specific business or someone they know, and that the AI will say it's an AI. **Start call** is disabled until confirmed.

**Errors to design:** missing or invalid fields jump to what needs fixing; refused by the ground rules (reason in the user's language); another call is already in progress (one at a time); hourly limit reached.

---

## 8. Live call

**Progress:** preparing → dialing → ringing → connected → in progress → wrapping up → done, plus a call timer. Failures: no answer, busy, voicemail (the AI leaves no personal details), failed (with reason).

**Transcript**, live:
- Both sides, plus the user's own messages to the AI (marked as not heard by the other party).
- Each line in the **user's language first, with the original underneath** (translations arrive ~1–2 s after each line). If the call is in the user's language, there's no translation.
- Lines the AI was interrupted on are marked.

**Listen live**: a control to hear both sides in real voice, about a quarter second behind; listen-only. Starts from a tap (OS audio rules). Stops when the call ends.

**Questions on hold** (Stay in the loop only): when the AI needs a decision, a prominent, urgent question appears:
- the question in the user's language (original underneath); amount and/or date and time when relevant;
- a countdown (default 60 s, then the AI says the user will follow up and moves on);
- **Approve / Decline / Reply…** (typed reply; for "we need your insurance info"-type questions, Reply is primary and the decline label is "Don't share");
- a typed reply is blocked if it contains card, SSN, password, or account numbers, with the reason;
- several can stack; answered ones collapse into a history line ("You approved…", "No answer in time…");
- it must get attention when the app is in the background (see Notifications).

**Message the assistant** (Stay in the loop only): a text field to steer mid-call ("tell them I'll be 10 minutes late"); it can't widen what the AI may agree to: anything outside the limits comes back as a question.

**Hand it off** mode shows a calm note instead ("won't interrupt you; you'll get the result").

**End call** (hangs up) and **Leave** (the call keeps going; the user can come back from history or the notification).

**Edge cases the AI already handles that the UI should reflect in the transcript:** call screening (the AI states who it is and, for personal calls, the message itself, then waits), hold music, phone menus (it can speak options, not press keys), the other side hanging up.

---

## 9. Result

Shown when the call finishes; also reachable from history and the "call finished" notification.

- **Headline** in the user's language ("Booked: Thu Oct 8, 2:00 pm at Smile Dental" / "Not booked: they only had 3 pm").
- **Appointment** if one was made: day, date, time, what. If the other side may not have agreed (the AI confirmed too early), it's labeled **needs confirmation**, not confirmed.
- **Summary** in the user's language (English underneath when different).
- **You decided during the call** (approved / declined / answered).
- **Needs your answer** (questions left open).
- **The assistant declined** (things it refused on your behalf).
- **Next steps** (in the user's language).
- **Please double-check** (warnings: something said that the rules didn't validate).
- Facts: extra charges (authorized or not), number of commitments.
- **Transcript** (expandable, translated like the live view).
- Actions: **Talk it over**, **New call**. (Optional: add the appointment to the phone's calendar, **New for mobile**.)

---

## 10. Talk it over

A voice/typed conversation with the assistant about a finished call. It opens by telling the user how it went, in their language, then answers questions from the call record and transcript only ("did they mention insurance?" → "it didn't come up"), and can set up a follow-up call from the previous one ("call back and take 3 pm"): only what changes is asked. Same conversation controls as Home.

---

## 11. Call history (New for mobile)

A list of the user's calls, newest first: who, when, status, and the headline. Live calls are marked and open the live screen; finished ones open the result. (API: list of calls and each call's full record.)

**Upcoming appointments** (from the profile) are worth surfacing here or on Home: date, time, with whom, "needs confirmation" when flagged.

---

## 12. Profile & privacy

- Header: name, phone number, languages, time zone.
- **Update by talking** (reopens the interview).
- Sections, each item deletable: usually free · may be shared on calls · preferences · upcoming appointments · contacts (link to phone book) · decisions from calls.
- **Sign out.** **Delete account** (with confirmation): removes the profile, phone book, and call history.
- Never stored: card numbers, bank details, SSNs, passwords, one-time codes (attempts are refused with a reason).

---

## 13. Settings

Voice; language I speak; default "during the call" choice; notification preferences; legal/about; sign out. (The web client's server URL and demo mode are developer-only and shouldn't appear in the production app; a demo/sample call for first-time users is a nice-to-have.)

---

## 14. Notifications (New for mobile)

- **Question on hold**, high priority, with **Approve / Decline** actions on the notification itself (Reply opens the app); shows the countdown deadline. This is the most important one: the other party is waiting.
- **Call finished**, with the headline ("Booked Thu 2 pm at Smile Dental").
- **Call failed / no answer / busy.**
- **Call screening** isn't a notification for the user; it's handled by the AI.

---

## 15. Permissions to ask for, in context

| Permission | When | If denied |
|---|---|---|
| Microphone | First tap on the mic | Typing still works |
| Location | First "near me" research | The assistant asks for a city or zip |
| Contacts | First "Import from contacts" | Add contacts manually |
| Notifications | Before the first call (explain: questions on hold, results) | In-app alerts only; hold questions may time out |

---

## 16. Content and tone

- The assistant is warm and brief. Everything generated is in the user's language.
- The other party is always told it's an AI; the app should never imply the user is on the call.
- Costs: calls cost a few cents a minute; research and sign-in codes a few cents each. No pricing UI in v1, but don't design for spamming retries.

---

## 17. Not in v1 (ideas, not requirements)

- **Join the call**: the user taps in and speaks to the other party directly (taking over from the AI).
- Answering hold questions by voice.
- Using the user's own number as caller ID (see the caller-ID notes in the README).
- Scheduling a call for later; recurring calls.

---

## Appendix for engineers

- **API:** the mobile app uses the same HTTP API as the web client (`/api/auth/*`, `/api/me*`, `/api/intake/*`, `/api/research`, `/api/calls*`, `/listen/:id` WebSocket). The server is the source of truth for every rule; keep the client thin.
- **Auth:** `Authorization: Bearer <session token>` from `/api/auth/verify`; store it in the Keychain/Keystore.
- **Voice conversation:** OpenAI Realtime over WebRTC with a 60-second key from `/api/intake/session` (`react-native-webrtc`, so a custom dev build, not Expo Go). Tool calls (`update_request`, `check_request`, `research`, `finish_intake`, `update_profile`, `finish_profile`) are relayed by the client exactly as `web/src/voiceIntake.ts` does.
- **Live call:** poll `GET /api/calls/:id` (≈1 s) or use `/api/calls/:id/stream` (SSE); questions `POST /api/calls/:id/questions/:qid`; messages `POST /api/calls/:id/messages`; hang up `POST /api/calls/:id/hangup`; listen: `POST /api/calls/:id/listen` for a ticket, then the `/listen/:id?ticket=` WebSocket (base64 μ-law 8 kHz frames tagged `them` / `ai`, plus `clear` and `end`).
- **Push:** new server work: register device tokens, send on `user.asked` (question on hold), call finished, call failed.
- **Contacts import:** `POST /api/me/contacts` per picked contact.
