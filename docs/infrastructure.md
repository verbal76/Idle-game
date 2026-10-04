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

## Runtime lineages and the future OTA cut-over (PLANNED, NOT PERFORMED)

- Old lineage: runtime `0.0.1`, Expo SDK 51, installed APKs signed with the debug keystore, receiving OTAs from the live branch (`claude/repo-gameplay-review-loq9rq`, OTA #83 and later) on channel `preview`. It keeps working exactly as it does today.
- New lineage: runtime `0.1.x` (the migration line; the final runtime name is chosen when it goes live), Expo SDK 54, API 36. A new runtime can never be updated from the old one: expo-updates only serves an update whose runtime version equals the installed one. So no old install receives migrated code over the air, and no migrated install receives old OTAs.
- Cut-over plan (all owner-triggered, none done): (1) finish testing OTA #83, then release PR #65 and the save backup as an OTA on runtime 0.0.1 so every old install has Back up & restore; (2) owner backs up and verifies; (3) owner installs the migration APK (same package, same debug key, so an in-place update that keeps saves; if Android refuses the update the signature differs and the backup is the only way); (4) physical test; (5) merge the migration line, pick the final runtime version, and publish OTAs for that runtime from the live branch (the OTA workflow, ancestry guard and delivery check are unchanged and runtime-aware, and the route guard enforces the runtime bump); (6) keep the old lineage alive on its own channel/branch for as long as old installs exist, or retire it deliberately.
- The applying-update modal is unchanged: it only reacts to the shell's `reloading` status, which comes from the same `UpdateGate` / `reloadNow` code under expo-updates 29.
- About / Copy diagnostics read the build's own identity: package ID, versionName, versionCode, runtime, channel, update ID, source commit, target SDK (from app.json), Play required target SDK and compliance, signing state, device Android/API. They show the migrated values (0.1.x, target 36, "Yes") on the migration line and the old ones (0.0.1, 34, "No") on the live line. The signing line still says "Debug keystore".

## Release pipeline (candidate branch)

| Workflow | Trigger | Produces | Publishes? |
| --- | --- | --- | --- |
| `eas-update.yml` | push to the live line / `main` only | OTA | the only OTA publisher; hold and candidate branches never trigger it |
| `eas-build.yml` | native changes, or `[build-apk]` in a commit message on `main`, the migration branch or the candidate branch | `Wheres-the-Bottom-v<N>.apk` + `.sha256`, `apk-report-<run>` (artifacts) | a GitHub Release only for `main` pushes |
| `release-android.yml` | manual, owner types `build-signed-release` | signed `.aab` + `.apk`, `SHA256SUMS.txt`, report (artifact) | never (no Release, no Play upload); fails first when the signing secrets are missing |

Gates in `eas-build.yml`: unit tests + `scripts/tests` (APK gate fixtures), then `scripts/inspect-apk.py` blocks the artifact on 16 KB misalignment, `zipalign -P 16`, targetSdk < 36, wrong package id or a blocked permission. Public names come from `release.json` (docs/release-naming.md). versionCode = run number. See docs/signing-continuity.md before any APK is installed over the owner's phone.

Artifact retention: `prune-artifacts.yml` keeps the newest 6 artifacts and never deletes one younger than 3 days (it used to keep 3, which removed the previous build's APK as soon as the next build finished). Scheduled and `workflow_run` workflows run from the default branch, so this takes effect when the change reaches `main`.
