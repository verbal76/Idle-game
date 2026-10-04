# API 36 migration (Class B): staged, isolated, debug-signed, no OTA

Branch `claude/hold-api36-migration`. NOT live. Ancestry: live OTA #83 `41c8cfb` → infrastructure hold PR #65 `d118842` → save protection `claude/hold-save-export` `a59ab98` → this line. The live branch, PR #65 and runtime 0.0.1 are untouched.

## Why SDK 54 (and not newer)

Google Play requires targetSdk 36 for new apps and updates (verified 2026-10-03, https://developer.android.com/google/play/requirements/target-sdk) and 16 KB page-size native libraries. Expo SDK 54 (React Native 0.81) is the first stack that ships both, and the last that still allows the old architecture (SDK 55 drops it), so it changes the least about how the game runs (a WebView with a JS shell). The sibling Tartaria project's own API 36 line landed on the same SDK 54 set. Newer SDKs (55 to 57) exist and would be a second, separate step.

## Rules kept at every stage

Package ID `com.hotatticgames.snow`; the existing debug keystore (no key change: a migration APK installs over the current one and keeps its saves); no AAB; no OTA (this branch triggers no publish; APKs are workflow artifacts only, never GitHub Releases); the runtime/app version is bumped every native stage so a migration build can never receive a runtime-0.0.1 OTA (0.1.0 / 0.1.1 / 0.1.2 / 0.1.3).

Build and evidence: GitHub Actions `eas-build.yml` (manual dispatch is not available to the automation, so a commit whose message contains `[build-apk]` builds from this branch). `scripts/inspect-apk.py` prints the SHA-256, SDK levels, effective permissions, signing certificate, ABIs and the 16 KB checks into the log and an `apk-report-<run>` artifact.

## Stages and evidence (all built on GitHub Actions, all debug-signed)

| Stage | Stack | Source | Run / artifact | versionCode / name | target SDK | 16 KB |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Expo 52.0.49, RN 0.76.9, React 18.3.1, expo-updates 0.27.5, webview 13.12.5 | `26847d8` | run 37137688080, `where-is-the-bottom-build-109.apk` (11279956217), sha256 `7d15d04fad65475d1830a721d0ea87d0f215e19c0cb7d3f2d3c7363e2d40f074` | 109 / 0.1.0 | 35 | NONCOMPLIANT (24 of 26 64-bit libs at 4 KB) |
| 2 | Expo 53.0.27, RN 0.79.6, React 19.0, expo-updates 0.28.18, webview 13.13.5, TS 5.8 | `9b64013` | run 37138859997, `…build-111.apk` (11279793144), sha256 `074cc1159f4d3ecafd72fd424725570fbe933fdebac987f2e03904762e2fa0d7` | 111 / 0.1.1 | 35 | COMPLIANT |
| 3 | Expo 54.0.37, RN 0.81.5, React 19.1.0, expo-updates 29.0.20, webview 13.15.0, TS 5.9 (+ babel-preset-expo 54) | `3b09df5` | run 37140248152, `…build-113.apk` (11280147233), sha256 `3409523dbf4d98eca094202fedcee33497f64d392952bdb7f0704b10010d7d4a` | 113 / 0.1.2 | 36 | COMPLIANT |
| 3b | + react-native-safe-area-context 5.6.2 (edge-to-edge insets) | `90a0d8c` | run 37141089831, `…build-114.apk` (11280876096), report artifact 11280492257, sha256 `a4adbd3e8cf8b2fe49d34e88b0dd1a6c4ccdbb9b4fa91bb33f4e41abf5be0668` | 114 / 0.1.3 | 36 | COMPLIANT |

Stage 3b is the current migration build: AGP 8.11.0, Gradle 8.14.3, Kotlin 2.1.20, JDK 17 (runner Temurin 17.0.20), NDK 27.1.12297006, build-tools 36.0.0, compileSdk 36, minSdk 24, Hermes, old architecture pinned (`newArchEnabled=false`), 4 ABIs, edge-to-edge on.

## Breakages found and fixed

1. The build workflow's `android-actions/setup-android` step asked for the retired `tools` package and failed before the build started (already rotten on `main`). Now installs nothing there; exact platform / build-tools / NDK are read after prebuild and installed.
2. SDK 53 stopped writing build-tools / NDK versions into `android/build.gradle`; the step now reads React Native's `libs.versions.toml`.
3. Expo 53's tsconfig needs TypeScript ≥ 5.4 (now 5.9); React 19 needs `@types/react` 19.
4. SDK 54: `babel-preset-expo` is no longer pulled in by expo; `:app:createBundleReleaseJsAndAssets` failed with "Cannot find module 'babel-preset-expo'". Reproduced locally with `npx expo export --platform android` (the bundling step Gradle runs), fixed with a direct devDependency. Run that command after any dependency change.
5. `expo install --fix` needs Expo's API, which the container cannot reach; versions come from `node_modules/expo/bundledNativeModules.json` instead (`expo install` equivalent).
6. SDK 52's template default target is 34 and the template merged `READ/WRITE_EXTERNAL_STORAGE` and `SYSTEM_ALERT_WINDOW` into the manifest: compile/target are pinned in app.json and those three permissions are blocked (`android.blockedPermissions`). Effective permissions are now INTERNET, VIBRATE, ACCESS_NETWORK_STATE (VIBRATE stays because web vibration needs it).
7. API 36 forces edge-to-edge (Android 16 ignores the opt-out): the shell wraps the WebView in `SafeAreaProvider` / `SafeAreaView` so the HUD stays clear of the gesture/navigation bar and cutouts.

## Not verified (physical test required)

Install the stage 3b APK over the current build on the owner's phone: saves kept? Game starts, renders, plays, audio, vibration, rotation, back button, update check (no OTA exists for runtime 0.1.3, so it should report up to date). Layout with insets in landscape and portrait, on a cutout phone, with gesture and 3-button navigation. Whether the installed debug certificate matches (the workflow's keystore is the Expo template's: CN=Android Debug, cert SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`); if Android refuses the update, the signature differs and the saves must be backed up first (docs/save-protection.md).

## Left as is

New architecture stays off (a later, separate decision). No AAB (docs/play-readiness.md), no production signing, no OTA, runtime cutover not performed (docs/infrastructure.md).

## Release gate and qualification (added on the candidate branch)

- `scripts/inspect-apk.py` is now a blocking CI gate (it was report-only): 64-bit ELF `p_align` >= 16 KB for every `.so`, `zipalign -c -P 16`, `targetSdkVersion` >= 36, package `com.hotatticgames.snow`, no `READ/WRITE_EXTERNAL_STORAGE` or `SYSTEM_ALERT_WINDOW`; it fails closed when aapt2/zipalign are missing and, for production (`ALLOW_DEBUG_SIGNING=0`), when the APK carries the public debug certificate. Unit-tested by `scripts/tests/test_inspect_apk.py` (synthetic ELF/APK fixtures) and run in CI before the Gradle build.
- Evidence from run 114 (`90a0d8c`, APK sha256 `a4adbd3e...0668`): compileSdk/targetSdk 36, minSdk 24, 24 of 24 64-bit libraries 16 KB aligned, `zipalign -P 16` PASS, effective permissions INTERNET / VIBRATE / ACCESS_NETWORK_STATE, v2 signature only (adequate for minSdk 24), `allowBackup=true`, debug certificate. ENGINEERING VERIFIED. Not verified on a device: rendering, audio, rotation, insets, update flow.
- The old step had `continue-on-error: true`, so a 16 KB regression would not have failed CI. Fixed.
- Signing continuity with the owner's phone: docs/signing-continuity.md.
