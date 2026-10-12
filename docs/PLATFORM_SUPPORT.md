# Platform support (studio standard v2.0, section 2)

One game, three targets, one source line (`authoritative.json`). Targets are selected by flag, never by branch:

    node scripts/build.mjs --platform android|windows|linux|all [--release] [--build-number N] [--source-sha SHA] [--android-apk FILE]

**Two kinds of build.** `--release` is the only kind that gets the standard file names: it needs the owner-approved full 40-character `--source-sha` equal to HEAD, a clean tree, `--build-number` equal to `release.json`, tests run, and a commit that contains the authoritative baseline and sits on the authoritative line; it refuses `--allow-dirty` and `--skip-tests`. The default is a **development** build: file names say `DEV` (`... Build NN DEV EXE.zip`), the manifest says `qualification: development` (and the dirty flag), and the release job refuses any `DEV` artifact. Any earlier desktop artifact built from an uncommitted tree is development evidence only.

| Platform | Package | Shell | Status (evidence) |
| --- | --- | --- | --- |
| Android | `<Title> Build NN APK.apk` | Expo SDK 54 / React Native 0.81 WebView shell, `com.hotatticgames.snow`, API 36, 16 KB aligned | Built on GitHub Actions (run 118); CI gate PASS; not device-tested on the new stack |
| Windows x86-64 | `<Title> Build NN EXE.zip` | Electron 44.7.0 shell (`desktop/`) hosting the same page | Packaged locally (cross-packaged on Linux); **never executed**: no Windows machine available |
| Linux x86-64 (native) | `<Title> Build NN Linux.tar.gz` | same Electron shell | Packaged and **executed headless** (Xvfb, software GL) in this environment: boots the game, studio splash plays and clears, 3 music tracks wired, no fatal screen. Not a Steam Deck |

`all` refuses to succeed unless all three exist (Android needs the hosted APK build, or `--android-apk`). The hosted equivalent is the manually dispatched `eas-build.yml` (`platform`, `source_sha`, `build_number`, `destination`), which publishes one GitHub Release per build number only after owner confirmation and environment approval (docs/release-authorization.md).

## Shared vs platform-specific

Shared (identical bytes on every platform): the whole game: `src/` built by Vite into one HTML page (physics, tricks, economy, saves, UI, splash). Platform adapters only: Android = `App.tsx` + expo-updates (OTA) + native back/haptics/music URL injection; Desktop = `desktop/main.js` + `desktop/preload.js` (window, F11 / Steam Deck fullscreen, `app://game` origin, music URL injection, navigation lockdown, quit and suspend bridges). Packaging per platform. No platform has its own gameplay branch.

## Known differences and gaps (honest)

- **Saves** are IndexedDB inside each shell's own origin (`https://localhost` on Android, `app://game` on desktop): progress does not move between platforms. Steam Cloud / cross-device sync is not implemented (needs Steamworks and a save-export bridge; the existing Back up & restore text format is the starting point).
- **Controls**: touch (Android, unchanged), plus gamepad and keyboard on every platform through one shared action layer (docs/controller-input.md). Verified in software and with a simulated pad only; not yet on physical controllers or a Steam Deck (docs/STEAM_HARDWARE_CHECKLIST.md).
- **Windows/Linux builds are unsigned**; Windows SmartScreen will warn. No Steamworks SDK, no SteamPipe depot config, no Steam Input config.
- Electron adds about 130 MB (Linux) / 170 MB (Windows) per package; the page itself stays 6.4 MB.
- Linux: `chrome-sandbox` needs the setuid bit or user namespaces; the headless check used `--no-sandbox`. Steam's runtime normally provides namespaces.

## Where the other required documents live

UPDATES: docs/ota-rollback.md, docs/release-architecture.md, docs/infrastructure.md. RELEASES: docs/release-authorization.md, docs/release-naming.md, docs/actions-budget.md. BRANCH_LEDGER: docs/branch-ledger.md (+ `.json`). THIRD_PARTY_ASSETS: docs/THIRD_PARTY_ASSETS.md and THIRD_PARTY_NOTICES.md. STEAM_HARDWARE_CHECKLIST: docs/STEAM_HARDWARE_CHECKLIST.md.
