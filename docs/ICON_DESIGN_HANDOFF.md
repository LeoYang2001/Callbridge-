# CallBridge app icon: design brief

**For:** the designer of the CallBridge app icon.
**What we need:** an iOS app icon (all appearances), plus the matching Android and web-app icons, that people recognize at a glance on a crowded home screen.

**Companion doc:** `docs/MOBILE_APP_HANDOFF.md` describes every screen of the app.

**Decided:**
- **Standalone brand.** It shares nothing with the founder's other business.
- **No color constraints.**
- **The name isn't final.** "CallBridge" is the working name and may change, so the icon must not depend on it (see §6).

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
2. **Two sides connected across a language gap.**
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
- **The name or a wordmark inside the icon.** iOS shows the app name under it.

## 6. What exists today

- **The current icons are placeholders, not a brand.**
  - The web app uses a blue (`#2557e8`) square with a white handset and two small green dots (`web/public/icon.svg`).
  - The new iOS/Android app (`mobile/`, built with Expo) still shows Expo's default template icon.
  
  Replace both freely.
- **The palette is yours to choose.** Nothing carries over from today's UI (accent blue `#2557e8`, call green `#1a9e4b`). The app will adopt the icon's palette; tell us the values.
- **Standalone brand.** It needs no resemblance to the founder's other business (Byte2Bite, restaurant websites).
- **The name may change.** "CallBridge" is a working name. Make sure the concepts don't depend on the word "bridge": the icon should still fit if the app gets another name. If a concept suggests a name, you're welcome to propose it.

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

## 8. Android and splash screen

The mobile app is built with Expo, so the same project also ships on Android. From the same design:

- **Android adaptive icon:** three 1024 × 1024 PNGs:
  - **Foreground:** the mark, transparent around it.
  - **Background:** a solid color or simple pattern.
  - **Monochrome:** a one-color silhouette, which Android tints for themed icons.

  Android crops these into circles, squircles and other shapes, and animates them. Keep the mark inside the central 66% of the canvas.
- **Splash screen:** a simple version of the mark on a solid background color. It's shown at about 76 pt wide while the app loads. Also tell us the background color.

## 9. Also needed: web app icons

The same app runs in the browser at callbridge.byte2bite.tech and can be added to a home screen. From the same design:

- an **SVG favicon** (simplified if needed);
- a **180 × 180 PNG** for iOS "Add to Home Screen": full bleed, no transparency, no rounded corners;
- **192 × 192 and 512 × 512 PNGs** for Android;
- a **512 × 512 maskable PNG**, with everything important inside the central circle (80% of the width).

These replace the files in `web/public/`.

## 10. Deliverables

**Round 1: concepts**
- 2 or 3 directions, roughly drawn.
- Each shown on an iPhone home-screen mockup, on a light and a dark wallpaper, next to Phone, Messages and Translate, at real size.

**Round 2: final** (for the chosen direction)
1. A layered source file (Figma, Sketch or Illustrator), with each layer named.
2. The **Icon Composer file** (`.icon`), if you have Apple's Icon Composer. It's the preferred iOS deliverable, and the app uses it directly. If you don't have it, send the exported layers instead (background plus 1–3 foreground layers, as SVG or 1024 px PNG), and engineering will assemble the file.
3. Flat 1024 × 1024 PNGs for Default, Dark and Tinted.
4. The Android adaptive-icon layers and the splash image from §8.
5. A small-size check sheet: 180, 120, 87, 60 and 40 px, in each appearance.
6. The web set from §9.
7. The color values, with a note on which should become the app's accent.

**Where the files go** (for engineering):

| File | Replaces |
| --- | --- |
| Icon Composer file | `mobile/assets/expo.icon` |
| 1024 px Default PNG | `mobile/assets/images/icon.png` (fallback) |
| Android foreground / background / monochrome | `mobile/assets/images/android-icon-*.png`, plus `adaptiveIcon.backgroundColor` in `mobile/app.json` |
| Splash image and color | `mobile/assets/images/splash-icon.png`, plus the `expo-splash-screen` `backgroundColor` in `mobile/app.json` |
| Web icons | `web/public/icon.svg`, `icon-180.png`, `icon-192.png`, `icon-512.png`, and `mobile/assets/images/favicon.png` |

## 11. How we'll judge it

- **Recognizable at 40 px.**
- **Never read as Phone, Messages or Translate** at a glance.
- **Says "phone calls" first,** and "between languages" second.
- **Works in Default, Dark and Tinted.**
- **No letters, flags or robot clichés.**
- **Still fits if the app is renamed.**
- **Calm and trustworthy,** so you'd hand it a doctor's appointment.
