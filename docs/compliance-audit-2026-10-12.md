# Compliance audit (overnight directive, 2026-10-12)

Evidence-based; `HOT_ATTIC_GAMES_MASTER_STANDARD.md` was NOT available anywhere accessible (not in the repository, any branch, or the filesystem), so this is the provisional audit the directive defines. The owner supplied `Source.zip` mid-session (SHA-256 `f6c75921b9d6ab2cb2b5249f547c7b7ba19e22da9f4f3b45693cf0912f25ded0`; inspected in an isolated scratch directory, not committed).

## Project facts

Where's the Bottom? is an Android-only game: Expo SDK 54 shell (React Native 0.81, new architecture off) hosting a Babylon.js 7 game built by Vite into one HTML page; touch controls; package `com.hotatticgames.snow`. `app.json` platforms: `["android"]`. There is no Windows, Linux or Steam target, no gamepad input and no Steamworks integration anywhere in the repository; the same bundle runs in a desktop browser only as the test harness.

## Glyph archive (`Source.zip`)

1,633 files: 1,580 PNG and 21 SVG, no license/readme file inside. Families: Keyboard_Mouse (505 PNG), P4Gamepad (315), P5Gamepad (315), SGamepad (230), XGamepad (215; Steam Deck ABXY prompts come from the Xbox family). The archive contains no license text. The owner then supplied a screenshot of the store listing: "Input Prompts" by JulioCacko (Unity Asset Store), published 2023-06-30, updated 2025-02-03, 128x128 px icons, four gamepad families plus keyboard/mouse in five color variants (matching the archive's five folders), asset license **Creative Commons Zero v1.0 Universal** ("free to use in any project, commercial or non-commercial, no attribution required"), code license MIT, "no generative AI used". Classification: license **identified, not independently verified** (a screenshot is not the source page or a license file shipped with the assets); keep the screenshot and the listing URL with the project's licensing records. Not integrated: the game has no gamepad input, so there is nothing to prompt for, and adding controller input is a control-scheme change (RED). Importing 17.6 MB of images would also threaten the ~10 MB page limit, so any future use must be a small, curated subset loaded outside the inline page.

## Scorecard

| Category | Status | Evidence | Action taken |
| --- | --- | --- | --- |
| Source and branches | PASS | One authoritative line (`authoritative.json`), ledger + check, all hold branches contained in the candidate | none new |
| Android | PARTIAL | API 36 / SDK 54 APK builds, 16 KB and target-API gate pass in CI (run 118); no device evidence for the new stack | none |
| Windows | NOT APPLICABLE (not configured) | no desktop target exists | reported |
| Linux | NOT APPLICABLE (not configured) | none | reported |
| Build flags / platform adapters | PARTIAL | shell/game seam documented (docs/architecture.md); no platform flag because there is one platform | none |
| Build numbering | PARTIAL | public `v<N>` from `release.json`; the directive's "Build NN" template conflicts with the owner's earlier v-number directive | owner decision N1 |
| GitHub Releases | PARTIAL | release job exists, dispatch-only; the old releases (106/107) predate the convention; one platform only | none |
| Build provenance | PASS | manifests (SHA, ref, version, runtime, toolchain, hashes), parity check | none new |
| Release authorization | PARTIAL | dispatch-only + exact SHA + environment, mutation-tested; NOT YET ON THE LIVE LINE (it still has the old push-triggered OTA until PR #65/#66 merge); environment reviewers not configured | F2 below |
| OTA architecture | PASS | expo-updates, channel `preview`, runtime = app version, safe-point apply, delivery verification | rollback runbook added |
| OTA rollback | PARTIAL | device fallback is expo-updates behaviour (not unit-testable); republish procedure now documented | docs/ota-rollback.md |
| OTA authenticity | FAIL | no code signing configured | RED F7 |
| Steam controller / Input / mixed input / text input | NOT APPLICABLE (no Steam target); gamepad support absent | none | reported |
| Steam display / graphics / performance / stability | NOT APPLICABLE; Android UI is tested at 320 px, portrait and landscape (smoke) | none | |
| Controller glyphs | BLOCKED (scope) | archive inspected; CC0 identified from the owner's store-page screenshot, not independently verified; no controller input exists to use it | F11 |
| Offline play | PARTIAL | `fallbackToCacheTimeout: 0`, offline update status handled and unit tested; first-launch-offline on a device not tested | none |
| Save safety | PASS (automated) | per-profile IndexedDB writes, validated migration, queue/retry, tested backup/restore | none |
| Steam Cloud | NOT APPLICABLE | | |
| Graphics settings | NOT APPLICABLE | no graphics options | |
| Branding | PASS | canonical logo splash, tested | none |
| Automated testing | PASS | see final report | notices tests added |
| Physical testing | UNVERIFIED | no recorded device results in the repository | owner |
| CI efficiency | PASS | marker-gated builds, weekly prune, no auto triggers | Node 22 alignment |
| Licensing | PARTIAL | code licenses verified from package metadata; music/art/model provenance missing | THIRD_PARTY_NOTICES.md |
| Commercial readiness | FAIL | signing continuity, music provenance, privacy policy URL, production keystore, device testing all open | |

## Work queue

| ID | Finding | Sev | Auth | Status |
| --- | --- | --- | --- | --- |
| F1 | Accidental OTA/Release publishing paths | P0 | GREEN | fixed on candidate/#65/#66 (7c0eaa4 family); live line fixed only by promotion |
| F2 | `release-android.yml` exposed signing secrets to every step (npm ci, tests, prebuild) | P2 | GREEN | fixed: secrets scoped to validate, re-decode and Gradle steps; decoded keystore removed in between; tested |
| F3 | Master standard unavailable | P1 | blocked | owner |
| F4 | No third-party notices | P2 | GREEN | `THIRD_PARTY_NOTICES.md` + generator + tests; in-app Credits screen is new UI (owner) |
| F5 | No OTA rollback runbook / known-good record | P2 | GREEN | docs/ota-rollback.md |
| F6 | Installed APK signing key unproven | P1 | owner | docs/signing-continuity.md |
| F7 | No OTA code signing | P2 | RED | needs key + new APK |
| F8 | Node 20 in CI/OTA workflows vs Node 22 locally/elsewhere | P3 | GREEN | aligned to 22 |
| F9 | Music / art / model provenance | P1 | owner | listed in notices |
| F10 | No Windows/Linux/Steam targets | info | RED | new platforms are a product decision |
| F11 | No gamepad input, so the (CC0-identified) glyph library has no use yet | P2 | RED | owner |
| F12 | Naming "Build NN" vs "v<N>" | P3 | owner | N1 |
