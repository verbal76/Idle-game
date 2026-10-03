# API 36 migration (Class B): staged, isolated, debug-signed, no OTA

Branch `claude/hold-api36-migration`. NOT live. Ancestry: live OTA #83 `41c8cfb` → infrastructure hold PR #65 `d118842` → save protection `claude/hold-save-export` `a59ab98` → this line. The live branch, PR #65 and runtime 0.0.1 are untouched.

Target: Expo SDK 54 (React Native 0.81, targetSdk/compileSdk 36, 16 KB-aligned native libraries, the last SDK that still allows the old architecture). Reached one SDK at a time: 51 → 52 → 53 → 54. Reference: the sibling Tartaria project's own API 36 line uses the same SDK 54 set (expo ~54.0.x, react-native 0.81.5, expo-updates ~29.0.x, react 19.1) with compile/target 36 pinned through expo-build-properties.

Rules kept at every stage: package ID `com.hotatticgames.snow`; existing debug keystore (no key change, so a migration APK installs over the current one and keeps its saves); no AAB; no OTA (this branch triggers no publish; APKs are workflow artifacts only, never GitHub Releases); the runtime/app version is bumped so a migration build can never receive a runtime-0.0.1 OTA.

Build and evidence: GitHub Actions (`eas-build.yml`; a commit whose message contains `[build-apk]` builds from this branch). `scripts/inspect-apk.py` prints the SHA-256, SDK levels, effective permissions, signing certificate, ABIs and the 16 KB checks into the log and an `apk-report-<run>` artifact.

## Stages

(Filled in as each stage completes; see the end-of-round report for evidence.)
