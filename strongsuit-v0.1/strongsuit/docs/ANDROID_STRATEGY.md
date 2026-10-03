# ANDROID — STATUS & FINISHING GUIDE

> **⚠️ SUPERSEDED IN PART (S23, 2026-09-27).** Coachwright moved to cloud accounts: coach data lives on
> Coachwright Cloud (readable by the operator, not end-to-end encrypted), the self-hosted and $15/mo
> managed relay tiers no longer exist, and Companion connects with a coach-issued code instead of E2EE
> pairing / WiFi / file sync. Anything below that says otherwise is history. Current design:
> `strongsuit-v0.1/strongsuit/docs/CLOUD.md`.
Written 2026-07-17 (S10). Companion to `docs/SERVER_STRATEGY.md`.

## Why Capacitor (the decision, so no one re-litigates it)

| Option | Verdict | Why |
|---|---|---|
| **Capacitor** (chosen) | ✅ | Wraps the *existing* Vite web build in a native WebView + a thin native shell. Zero UI rewrite — Coachwright's React app, design system, Dexie/IndexedDB layer, and MediaPipe tracking all run unchanged inside the WebView. This is the only option that doesn't duplicate the entire app in a second codebase. |
| React Native | ❌ | Would mean rewriting every screen in RN primitives — the Program Builder's dnd-kit drag-and-drop, the Film Room's canvas/video work, and Dexie itself (RN has no IndexedDB) would all need native reimplementation. Months of duplicate work for a UI that already exists. |
| Cordova (old PhoneGap) | ❌ | Predecessor to Capacitor, same wrapping concept, but unmaintained/slower-moving — Capacitor is its actively-developed successor and is what Cordova plugins now target anyway. |
| PWA-only, skip a native app | ✅ *(fallback, always available)* | The web build is already installable as a PWA on Android Chrome (once Phase 9's manifest/service worker ships) with an icon on the home screen and offline support — no Play Store, no signing keys, no $25 developer fee. If the buyer doesn't need Play Store distribution, this is the zero-effort answer and is worth offering explicitly. |

## What's done (this session, S10)

- `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` installed.
- `capacitor.config.ts` at the project root — `appId: com.coachwright.app`, `webDir: dist` (the same build the desktop app and web host use).
- `android/` — a real, Capacitor-generated Android Studio project (Gradle wrapper, manifest, the standard Capacitor bridge). **Not yet built or run** — this sandbox has no Android SDK, no `adb`, no Gradle, and no emulator/device, so the APK itself has never been compiled or tested. Treat everything past this point as **unverified until a human runs it once.**

## What's left (needs a machine with Android Studio — cannot be done in this environment)

1. **Install Android Studio** (includes the SDK, platform tools, and an emulator). One-time, free.
2. From `strongsuit-v0.1/strongsuit/`:
   ```
   npm run android:sync   # builds the web app, copies it into android/, syncs Capacitor
   npm run android:open   # opens the android/ project in Android Studio
   ```
3. In Android Studio: let Gradle sync finish, then **Run** on an emulator or a plugged-in device. This is the first real test of whether the app works on Android at all — expect to spend time here on:
   - **Mobile viewport pass.** The Program Builder's drag-and-drop and the Film Room's dual-video controls were built desktop-first (spec §6 flags this honestly: "the builder may present a simplified mobile mode"). Budget a session for a phone-width QA pass across Clients, Logging, and Check-ins (the mobile-critical paths per spec) before calling Android done.
   - **File input for Film Room.** Loading a video file via `<input type="file">` should trigger Android's native picker automatically in a Capacitor WebView — verify on-device; if it doesn't, the fix is the `@capacitor/filesystem` + a native file-chooser plugin, not a rewrite.
   - **MediaPipe/WASM on Android WebView.** The pose-tracking model (`public/mediapipe/`) is plain WASM/JS bundled into the app's own assets — it should load the same way it does on desktop Chrome, but WebView's WASM performance on low-end Android devices is unverified. If it's too slow on real hardware, the honest fallback is hiding the "Track movement" button below a minimum-device check rather than shipping a laggy feature.
   - **Storage persistence.** `navigator.storage.persist()` (already called in `main.tsx`) behaves differently across Android WebView versions — confirm IndexedDB survives the OS reclaiming storage under pressure.
4. **Signing & Play Store** (only if distributing there): generate a keystore, configure `android/app/build.gradle` signing config, build a release AAB (`./gradlew bundleRelease`), and set up a $25 one-time Google Play developer account. None of this is started — it's a well-documented, standard Android process independent of anything specific to Coachwright.

## Keeping Android in sync with future web changes

Every time the web app changes, re-run `npm run android:sync` before testing on Android again — it rebuilds `dist/` and copies it into the native project. The `android/` folder is generated/managed by Capacitor; avoid hand-editing generated Gradle files unless you know exactly what you're changing (Capacitor's own docs cover the supported customization points).
