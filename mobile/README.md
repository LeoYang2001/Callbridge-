# CallBridge mobile

Expo (React Native, SDK 57) app for iPhone and Android. It talks to the same server as the web
app; the API client, the voice-intake logic and the live-listening decoder are shared from
`../shared/client`.

## Layout

- `src/lib/` — platform pieces: session (token in the Keychain), WebRTC intake
  (`react-native-webrtc`), live listening (`react-native-audio-api`), push, contacts picker,
  location.
- `src/hooks/` — everything a screen needs, with no UI: `useSignIn`, `useIntake`,
  `useStartCall`, `useCall` / `useListen`, `useCalls`, `usePhoneBook`, `useProfile`,
  `usePreferences`, `useNotifications`.
- `src/app/` — Expo Router screens. These are **placeholders** built from `src/ui/placeholder.tsx`
  (no design language). The designed UI replaces the screens and that file; the hooks stay.

## Run it (iOS simulator)

```bash
npm install                 # also applies patches/ (patch-package)
npx expo prebuild --platform ios --no-install
npm run pods                # pod install + scripts/verify-pod-configs.sh
npx expo run:ios --no-bundler
npx expo start --dev-client --port 8082
```

Needs a development build (not Expo Go): WebRTC and native audio are custom native code.
`ios/` and `android/` are generated (CNG) and not committed.

The server URL defaults to https://callbridge.byte2bite.tech; set `EXPO_PUBLIC_SERVER_URL` to use
another.

## Version pins (Xcode 26.2)

The newest SDK 57 patch releases (expo-modules-jsi 57.1, expo-modules-core 57.0.21+) need the
Swift 6.3 compiler from Xcode 27. Until this Mac has it, `package.json` pins every Expo package
to the set published with expo 57.0.14 (`overrides` for the transitive ones), plus one small
patch in `patches/`. To move up: install Xcode 27, delete the pins and `overrides`, run
`npx expo install --fix`, and drop the patch if it no longer applies.

## After every `pod install`

Run `./scripts/verify-pod-configs.sh` (`npm run pods` does). CocoaPods can leave the prebuilt
React framework's debug/release marker wrong, and the app then fails to link or crashes at
launch before any JS runs.

## Push notifications

The server sends one when someone is on hold for your decision and when a call ends. Getting a
push token needs a real phone and an EAS project id: run `npx eas init` once (free Expo
account), which adds it to the app config.
