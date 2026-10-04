# OTA, applying-update, About diagnostics and studio splash

## OTA architecture (existing, preserved)

- Mechanism: expo-updates (EAS Update), project `147c7fa1-88de-4800-8c08-c5e6411f069e`, channel `preview`, runtime = `expo.version` (policy `appVersion`).
- OTA-safe payload: everything in the web game (the single-file HTML embedded in the JS bundle), App.tsx and its JS imports, JS-side assets. NATIVE boundary: app.json, `android/`, `ios/`, runtime `dependencies`, native-carrying packages in the lockfile (see `.github/scripts/release-route.sh`, which also fails a native change that does not bump `expo.version`).
- Publication: `.github/workflows/eas-update.yml` on pushes to the live branches (route, `npm ci`, lint, unit tests, bundle regeneration, Playwright smoke, real-bundle check, page-size budget, ancestry guard, publish with pinned eas-cli, channel re-link, delivery check against u.expo.dev). Every OTA carries its commit, label, run and branch in the manifest (`app.config.js` → `extra.ota`).
- Discovery (automatic): App.tsx checks 1.5 s after launch and every 90 s while running; no owner action. A manual "Check for updates" exists in Settings for diagnostics only.
- Download / verify / stage: `Updates.fetchUpdateAsync` (expo-updates verifies and stores the update; a partial download is never launched). Integrity: expo-updates asset hashes; HTTPS only.
- Safe activation: `UpdateGate` applies only on an idle screen (main menu / launch prompt) or when a run ends; the page saves first (`__wtbBeforeReload`) and music is silenced before `Updates.reloadAsync`.
- Rollback / recovery: expo-updates falls back to the embedded or previous bundle after a failed launch (reported as `isEmergencyLaunch`, shown in About). A failed reload keeps the old version running and reports `ready` again.
- Offline: the check fails quietly (status `offline`); the known-good bundle runs.
- Compatibility: a runtime-version mismatch is refused by expo-updates; the route script blocks publishing native changes as OTA.
- What cannot be unit-tested here (provided by expo-updates, device-only): corrupt/interrupted downloads, hash mismatch, launch-failure rollback.

## "Please wait, applying update"

- Code: `src/ui/ApplyingUpdate.ts` (state machine + modal), mounted in `main.ts`; styled in `style.css` (`.applying-update`) with the game's own panel, fonts and colours.
- Trigger: only the shell's `reloading` status (sent immediately before the bundle swap, after the update is downloaded and a safe moment is reached). Never for checking, downloading, waiting, deferral, offline or failure.
- Behaviour: full-screen, swallows touches, Android Back does nothing meanwhile, indeterminate spinner (no fake percentages). No fixed timer: any other status removes it (a failed reload reports `ready`), a 30 s watchdog removes it if the shell never answers, and a successful reload replaces the page.
- Tests: `ApplyingUpdate.test.ts` (state machine) and the smoke test (real DOM: exact text, blocking, removal).

## Settings → About

- Location: Main menu → Settings → About.
- Shows: name, version and versionCode, **Copy diagnostics**, and "Build & update details" (same rows, short/full IDs, Copy).
- Fields (src/shell/buildInfo.ts, one source for About, the details panel, Copy and the bug-report email): application; Android release/API, device, locale; package ID, versionName, versionCode, runtime; updates enabled, channel, running source (OTA / embedded / emergency), OTA name, update ID, published time, source commit and branch; update state and when it last changed; target SDK (build config), Play required target SDK (with the date verified), Play API compliant yes/no/unverified, signing state.
- Copy diagnostics: plain grouped text (APPLICATION / DEVICE / INSTALL / OTA / UPDATE STATE / GOOGLE PLAY / ANDROID) with a captured-at time; no secrets, tokens, save data or e-mail addresses. If the WebView has no clipboard, a selectable copy is shown.
- Device-only fields: Android release/API/model come from React Native `Platform` (no new native module) and show "Unavailable" in a browser. The installed APK's real targetSdk is not readable at runtime, so it is the build-config value.

## Hot Attic Games studio splash

Studio-wide requirement and details: **docs/studio-splash.md** (and CLAUDE.md). Summary: canonical artwork `Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png` (repository root, never edited); `src/ui/StudioSplash.ts` shows it on every cold launch before the game's own opening (about 2.8 s, contained, transparency kept, once per page load); OTA-capable (page code only, no native build); wired and tested. The old "logo missing" blocker and the obsolete `branding/Hot_Attic_Games_Master_Logo.png` path are retired.

