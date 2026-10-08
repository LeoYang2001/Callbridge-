# CallBridge design handoff v1.1

Builds on the v1 handoff (`README.md` in this folder). Everything below is **already built** with
interim UI that follows the v1 language (edge glow, tokens, pills, cards). Please design the final
version; where the build made a choice, it's noted as "built as" so you can keep it or replace it.

**One rule changed from v1: "needs you" is amber everywhere.** The hold question, the in-app
capsule, the Dynamic Island and notifications all use amber (`#d48a00` accent, glow
`#f3c45c → #d48a00`, text `#855600`, tint `#fff3d1`). Please update the in-app hold screen from
violet to amber. Violet stays for "looking it up".

---

## Part A: Changes from the first TestFlight round

### A1. The menu opens with a swipe from the right edge (no menu button)

Testers found the menu button easy to miss and in the way. The 40 pt menu button is gone. The
menu opens by **swiping in from the right edge** of any screen once signed in.

**Built as:**
- **Where it starts:** a 24 pt strip along the right edge. A drag to the left of 90 pt (or a fast
  flick) opens the menu; less springs back. Vertical scrolling isn't affected.
- **The glow cue while dragging:** light gathers along the **right border only**.
  - It grows from 6 to about 50 pt wide and brightens with the drag.
  - **Aura blue** (`#5cc8ff`) while dragging.
  - At the open point it turns **brand blue `#2557e8` fading into violet `#b59cff`**, with a crisp
    haptic, meaning "let go to open". That color change is the cue testers asked for.
  - On release it fades out over 0.35 s.
- **The menu** slides in from the right (280 ms) instead of fading.
- **First run:** on Home, the right-edge cue peeks twice and a toast says "Swipe in from the right
  edge for the menu" (once per install).
- **VoiceOver:** edge swipes aren't practical with VoiceOver, so the old menu button appears only
  when VoiceOver is on.

**Please design:**
- The cue at rest (invisible?), mid-drag, and at "ready", so it reads as part of the edge-glow
  system, not a separate effect. It has to work over every glow mode: idle aura, green hairline
  on calls, amber on hold.
- Whether the menu follows the finger (a sheet you pull in) or appears after release, as built.
- The first-run hint: the peek, the copy, and whether it repeats until used.
- Where swiping is off: during sign-in and onboarding it's off. Should it also be off on the live
  call and hold screens, to avoid accidents?

### A2. The talk button stays under your finger

Testers pressed the big Home button and it slid to the bottom of the screen mid-press, out from
under their finger.

**Built as:**
- While held, the button **stays exactly where the press began, at the same size**.
- Your words appear **just above the button**, growing upward as you speak.
- After release, the conversation continues and the button moves into the bottom controls
  (speaker · talk · mic state), as in v1.

**Please design:**
- **Listening started from Home:** the 104 pt button at its Home position, the live words above
  it, the "LISTENING · RELEASE TO SEND" label, and the glow. v1 only designed Listening with the
  button at the bottom.
- **The transition after release:** the button easing from Home to the bottom controls.

### A3. Haptics

Testers felt no haptics at all. Here is the vocabulary as built. Please confirm it, or adjust
which moments get which feel.

| Moment | Feel (iOS) |
|---|---|
| Any ordinary button, settings row | light impact |
| Call now, End call, Approve, the green call buttons | medium impact |
| Answer chips, segmented controls, toggles, menu items | selection tick |
| Talk button goes down (mic live) | medium impact |
| Talk button released (words sent) | soft impact |
| Edge swipe reaches "let go to open" | rigid impact |
| Menu opens | medium impact |
| Call connects | light impact |
| Someone is on hold for you (also from the capsule elsewhere in the app) | warning notification |
| Good result (booked, delivered, answered), added to calendar | success notification |
| No answer, not done | error notification |

iOS turns them all off when the user disables System Haptics.

### A4. Text that doesn't fit

Long text ran off screen, for example the contact screen in the phone book.

**Built as:**
- Top-bar back labels ("‹ Phone book") are one line and shrink, so they never push into the title.
- Detail rows (Number, Speaks, Address) wrap the value to two lines, right-aligned, up to 60% of
  the row.
- Long names wrap and center on the contact screen.
- Pills (relationship, language) truncate with an ellipsis.
- On Me, "Default call mode" puts its segmented control on its own line under the label.

**Please spec truncation rules for:**
- names (one line or wrap?)
- addresses
- relationships
- the transcript quote on the live call
- result headlines
- errand cards

Check them against these stress cases, in Chinese, Tagalog and Spanish as well as English:
- "Memphis Family & Cosmetic Dentistry of Germantown"
- "7690 Farmington Blvd, Suite 210, Germantown, TN 38138"
- "dentist (the new one)"
- Mandarin headlines of 25+ characters
- 375 pt-wide phones (iPhone SE, mini)

---

## Part B: Features added after v1

### B1. Errands: calls the assistant makes on its own

The user queues several calls and walks away. The server works through them one at a time, only
within calling hours, and tries again if a line is busy. The phone doesn't need to stay open.

**Rules the UI should explain, briefly:**
- **Calling hours** (user's time zone): businesses Mon–Sat 9:00–18:00; personal calls 9:00–21:00
  every day.
- **Retries:** busy, no answer or voicemail is tried again 20 minutes later, up to 3 tries.
- **One at a time,** about a minute apart. At most 20 errand calls a day.
- **Hold questions still reach the user.** If nobody answers, the assistant politely declines and
  the errand comes back as "Needs you". Walking away never commits the user to anything.

**a. Choosing "errand" on Review & confirm.** Built as a blue text link under Call now: "Add to
errands instead". We also support "tomorrow morning" (9:00 the next day, skipping Sunday) and
"not before a time I pick". Please design how the user picks **Call now · Add to errands ·
Tomorrow morning · Pick a time** without competing with the green Call now button.

**b. Errands screen** (from the menu, Me, and the errands notification). Sections: In the queue,
Finished. Each card shows who, the task in the user's language, a status line, the outcome once
finished, the number of tries when more than one, and actions.

| Status | Status line | Actions |
|---|---|---|
| Waiting | "Up next" · "Scheduled · tomorrow at 9:00 AM" · "Waiting for calling hours · Mon at 9:00 AM" · "Will try again · at 3:20 PM" · "Waiting for the line" · "Daily limit reached; continuing later" | Cancel |
| Calling now | "Calling now" | Open live call, Cancel (hangs up) |
| Done | The call's headline, e.g. "约好了：周二下午3:30" | See the call |
| Needs you | The outcome, e.g. "他们要你先确认保险" | See the call, Try again |
| Couldn't get through | e.g. "No answer. Tried 3 times." | Try again |
| Canceled | — | Try again |

- **Empty state:** "No errands yet. Set up a call and choose 'Add to errands'."
- **Glow:** please choose one for this screen and for the "calling now" card.

**c. Notifications.**
- A push right away when one needs the user while others are still waiting: title "Dentist: needs
  you", body = the outcome.
- One summary when the queue empties: title "Errands: 3 of 4 done". Body, one line each:
  - "✓ Pharmacy: 药已经准备好了"
  - "• Dentist: needs you · 他们要你先确认保险"
  - "✗ DMV: No answer. Tried 3 times."
- No push per retry.

**d. Dynamic Island / capsule.** The batch states from v1 apply. Please check them against
"waiting for calling hours", when nothing is calling.

### B2. Results: Add to calendar and Get directions

- **Booked result:** the primary black pill is **Add to calendar**. It opens the iPhone's own New
  Event sheet, prefilled with title, time, place, notes, and an alert an hour before. After saving
  it reads "Added to calendar" (disabled).
- **Get directions** (secondary pill): shown when the place has an address, or for any business
  call. It opens Apple Maps. Not shown for personal calls.
- **Not confirmed:** an appointment the other party didn't clearly agree to shows "(not confirmed
  by them yet)" in an amber bullet. Please design how that sits next to Add to calendar.
- **Order as built:** Add to calendar / Get directions / [Talk it over · Transcript]. Please set the
  hierarchy, and the Done path when there's nothing to add.

### B3. Hold question: a third answer and an adjustable hold

- **Answers:** Approve (amber, primary), Decline, **Decide later**. Decide later means the assistant
  tells them the user will get back to them, doesn't agree, and continues. The question becomes a
  follow-up on the result.
- **Hold length** is the user's setting: 15 / 30 / 45 / 60 / 90 s, default 30. The countdown and
  the edge trace use it.
- **The in-app capsule** offers Yes / No / Open. Should Decide later appear there too?

### B4. Push-to-talk: words appear live while holding

- **Live words:** the phone transcribes while the button is held. On release, **that exact text** is
  what the assistant receives, so what the user sees is what it understood.
- **Listening** shows the growing transcript (31/500, blue caret), just above the button (see A2).
- **Nothing heard:** "I didn't catch that. Hold the button and try again." Please design it
  (toast or inline).
- **Fallback:** languages the phone can't transcribe (e.g. Hmong, Somali, Amharic, Haitian Creole)
  send the voice instead, and the words appear just after release. At most a subtle difference;
  ideally the same screen.
- **Mic indicator:** the mic is on only while holding, so "Mic on / Mic off" is literal.

### B5. Me and Notifications additions

**Me:**
- **Extra charges:** Ask me first · Up to $25 · $50 · $100. The default for new calls.
- **Hold for my answer:** 15–90 s, with the line "How long the other party waits while you decide".
- **Default call mode:** on its own line under its label (see A4).
- **Errands** row.
- **"The assistant may share":** the toggles are live. Off means the assistant won't offer that fact
  on calls.

**Notifications:**
- Hold questions: "Always on" (amber pill).
- Call results.
- **Upcoming reminders:** a push the evening before (from 18:00) an appointment the assistant
  booked, e.g. "Tomorrow 2:00 PM · Smile Dental" with its notes.
- Live Activity.

---

## Deliverables

Hi-fi at 390×844 in the v1 file:
- **The edge swipe:** the cue at rest, mid-drag and ready; the menu entrance; the first-run hint.
- **Listening:** started from Home (button in place, words above), and the transition after
  release.
- **The haptics table,** confirmed or changed.
- **Truncation rules,** with the stress cases at 390 and 375 pt.
- **Review & confirm** with the timing choice.
- **Errands:** every status above, plus the empty state.
- **Results:** booked with Add to calendar and Get directions; booked but not confirmed.
- **The hold question** with three answers.
- **The "didn't catch that" state.**
- **Me and Notifications additions.**
- **The two errand notifications** (lock-screen style), plus checks of the island and capsule
  batch states.

Copy is final where given; UI chrome stays English for v1, and content is in the user's language.
