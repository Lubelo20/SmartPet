# mobile/ — the feeder on a phone

An Expo app that runs the dashboard on iOS and Android. Open it with **Expo
Go** — no build, no store account, no native toolchain.

```bash
cd mobile
npm install
npx expo start        # scan the QR with Expo Go (Android) or Camera (iOS)
```

Both devices must be on the same Wi-Fi. If your network blocks device-to-device
traffic (common on campus and guest Wi-Fi), use `npx expo start --tunnel`.

## Why a WebView and not native screens

The dashboard is already responsive, and the pet identification runs on
TensorFlow.js — which needs a browser engine. A WebView has one; Expo Go has no
native TFJS runtime and cannot load custom native modules at all. So this shell
gets the camera identification working on a phone *unchanged*, which a native
rebuild could not do without a different ML stack.

`App.tsx` owns only what a web page cannot do for itself: the native frame and
safe areas, the Android back gesture walking WebView history, an offline state
with a retry, and the camera permission grant.

## Configuration

The URL lives in `app.json` under `expo.extra.appUrl`. Point it at a local dev
server to test unreleased dashboard changes — use your machine's LAN IP, not
`localhost`, which on a phone means the phone:

```json
"extra": { "appUrl": "http://192.168.0.42:3000" }
```

## Known limits, honestly

- **Google sign-in may be refused.** Google blocks OAuth inside embedded
  webviews (`disallowed_useragent`). Email/password sign-in works normally.
  Fixing this properly means `expo-auth-session` with a native Google flow —
  its own piece of work, and only worth doing if you want the Google button.
- **Camera identification needs the permissions in `app.json`.** In Expo Go the
  prompt comes from the Expo Go app itself, so it reads "Expo Go would like to
  access the camera". A standalone build shows your app's own name.
- **Nothing is cached offline.** No connection means the retry screen. Offline
  support would need a service worker in the dashboard, not changes here.
