# CallBridge iOS app icon: design brief

**For:** the designer of the CallBridge app icon.
**What we need:** an iOS app icon (all appearances), plus the matching web-app icons, that people recognize at a glance on a crowded home screen.
**Companion doc:** `docs/MOBILE_APP_HANDOFF.md` describes every screen of the app.

---

## 1. What CallBridge does

CallBridge makes phone calls for you in another language.

- **You ask in your own language,** by talking or typing to the assistant: "call my dentist and book a cleaning next week", "tell Tabito I can't make Bible reading tonight", "call the nearest Mexican restaurant and ask when they close".
- **It works out the details.** It finds the number in your phone book, or looks the place up online, and asks only what's missing.
- **It checks the request against safety rules.** It won't do banking, legal matters, emergencies, sales, or anything deceptive.
- **An AI places the call,** speaking the other person's language. It says up front that it's an AI calling for you.
- **You can follow along live:** read the call translated into your language, listen in, and answer the AI's questions while the other side holds. Or you can hand the call off completely.
- **Afterwards you get the result in your language,** and it remembers what it learned (the contact, the appointment, your decisions).

## 2. Who it's for

People who don't speak the local language comfortably. The first user is a Mandarin speaker in the US, who also calls family and friends in Tagalog and Japanese. The app speaks with users in Mandarin, Cantonese, Spanish, Vietnamese, Korean, Tagalog, Russian, Arabic, Hindi, Japanese, English and more.

These users hand CallBridge real things: a doctor's appointment, a message to a partner. **Trust matters more than flash.**

## 3. What the icon should say

In priority order:

1. **Phone calls.** Someone scanning their home screen for "the app that calls for me" should find it.
2. **Two sides connected across a language gap:** the bridge.
3. **Someone capable helping on your behalf.** Calm and dependable.

**Feel:** warm, calm, competent. Not techy or robotic, not corporate telecom, not playful or childish.

## 4. Possible starting points

These are only prompts; the direction is yours.

- **Two speech bubbles of different shapes** (one per language) joined into a single arc or span.
- **A handset whose curve becomes a bridge.**
- **A sound wave that changes character partway across.** One voice goes in, another comes out.
- **A path or span between two points,** with a voice element on it.

## 5. What to avoid

- **Letters or characters from any script** (A, 文, あ, ب…). The app serves many languages equally, and no script should look like the "main" one. Text also becomes unreadable at small sizes.
- **Flags or maps:** language isn't nationality, and flags can be politically sensitive.
- **"AI" clichés:** robot faces, sparkles ✨, glowing brains, circuit traces.
- **Anything that could be mistaken for a familiar app at a glance:**
  - Apple Phone (white handset on green)
  - Messages or WhatsApp (speech bubble on green)
  - FaceTime (camera)
  - Google Translate or Apple Translate (A/文 glyphs, split blue-and-white tiles)
- **Call-center imagery:** headsets and operators suggest a company calling you, which is the opposite of what CallBridge is.
- **Emergency or medical signs:** red crosses, sirens, 911.
- **Fine detail:** thin strokes, small dots and gradients that disappear at 40 px.
- **The name or a wordmark inside the icon.** iOS shows "CallBridge" under it, and the name fits without being cut off.

## 6. What exists today

- **The current icon is a placeholder, not a brand.** It's a blue (`#2557e8`) rounded square with a white handset and two small green dots (`web/public/icon.svg`). Replace it freely.
- **The app's colors can change.** The UI uses an accent blue (`#2557e8` light, `#6f8fff` dark) and a "call" green (`#1a9e4b` / `#34c46b`) for the Start-call button and live-call indicators. The app will adopt whatever palette the icon sets; tell us the values.
- **Byte2Bite is a separate business.** The founder's other company builds restaurant websites, with its own design system (Inter, a "spruce" accent). CallBridge doesn't need to resemble it unless the founder decides otherwise (see §10).

## 7. iOS requirements

Check these against Apple's current Human Interface Guidelines for app icons before finalizing. This list reflects iOS 18 and iOS 26, and Apple revises it yearly.

- **Master:** 1024 × 1024 px, square, sRGB or Display P3, no transparency in the default appearance. **Don't round the corners;** iOS applies the mask itself. Keep the important shapes within the central area (roughly the middle 80%), so the mask and glass edge don't clip them.
- **Three appearances:**
  - **Default (light):** the full-color icon.
  - **Dark:** for dark home screens. Usually the foreground on a dark or system-provided background, with colors adjusted to stay legible.
  - **Tinted:** a single grayscale version that iOS tints to the user's chosen color. It must still read as CallBridge with no color at all.
- **iOS 26 layered (Liquid Glass) icons:** icons are built from separate layers (a background plus a few foreground layers) in Apple's Icon Composer, which adds depth, highlights and the glass effect. **Design in layers**: keep the background and each foreground element as separate vector layers, so engineering can assemble the Icon Composer file. A flat icon still works, but looks less native.
- **Small sizes:** iOS scales the master down. The icon must hold up at:

  | Where | Size on screen | Pixels (@3x / @2x) |
  | --- | --- | --- |
  | Home screen | 60 pt | 180 / 120 |
  | Spotlight | 40 pt | 120 / 80 |
  | Settings | 29 pt | 87 / 58 |
  | Notifications | 20 pt | 60 / 40 |
  | App Store | n/a | 1024 |

  Aim for **one clear silhouette** that is recognizable as a 40 px thumbnail.

## 8. Also needed: web app icons

The same app runs in the browser at callbridge.byte2bite.tech and can be added to a home screen. From the same design:

- an **SVG favicon** (simplified if needed);
- a **180 × 180 PNG** for iOS "Add to Home Screen": full bleed, no transparency, no rounded corners;
- **192 × 192 and 512 × 512 PNGs** for Android;
- a **512 × 512 maskable PNG**, with everything important inside the central circle (80% of the width).

These replace the files in `web/public/`.

## 9. Deliverables

**Round 1: concepts**
- 2 or 3 directions, roughly drawn.
- Each shown on an iPhone home-screen mockup, on a light and a dark wallpaper, next to Phone, Messages and Translate, at real size.

**Round 2: final** (for the chosen direction)
1. A layered source file (Figma, Sketch or Illustrator), with each layer named.
2. Exported layers for Icon Composer: background, plus 1–3 foreground layers, as SVG or 1024 px PNG.
3. Flat 1024 × 1024 PNGs for Default, Dark and Tinted.
4. A small-size check sheet: 180, 120, 87, 60 and 40 px, in each appearance.
5. The web set from §8.
6. The color values, with a note on which should become the app's accent.

## 10. How we'll judge it

- **Recognizable at 40 px.**
- **Never read as Phone, Messages or Translate** at a glance.
- **Says "phone calls" first,** and "between languages" second.
- **Works in Default, Dark and Tinted.**
- **No letters, flags or robot clichés.**
- **Calm and trustworthy,** so you'd hand it a doctor's appointment.

## 11. Open questions for the founder

1. Is **CallBridge** the final name for the App Store?
2. Should CallBridge show any family resemblance to Byte2Bite, or stand alone?
3. Any color the icon must or must not use (keep the blue, avoid green, etc.)?
