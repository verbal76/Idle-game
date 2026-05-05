# Boarder

Stylized snowboarding game for Android. Phone-only development. Distributed
as a sideloaded APK; gameplay/code updates ship over-the-air via EAS Update
so you don't reinstall for every change.

- **Half-pipe** — active twin-stick gameplay. Left stick steers, JUMP and
  FLIP buttons drive the air game.
- **Downhill** — idle / tap. Auto-runs a procedural mountain; you only
  intervene to jump or flip until you hit something.

Runs are continuous — there is no restart button.

## Stack

- **Babylon.js + TypeScript + Vite** is the entire game. Vite's single-file
  build collapses the whole thing into one self-contained `dist/index.html`.
- **Expo + react-native-webview** is a thin native shell. `App.tsx` loads
  the bundled `dist/index.html` into a WebView. That's the entire native
  surface.
- **EAS Build** produces signed Android APKs in the cloud.
- **EAS Update** pushes the JS+asset bundle (the new `dist/index.html`)
  OTA on every push. Installed apps fetch the new bundle on next launch.
- **IndexedDB** (via `idb`) for multiple local profiles inside the WebView.

No hosting, no GitHub Pages, no third-party host. The repo is private.

## One-time setup (you, mobile Chrome)

1. **expo.dev** → sign in → **Projects** → **Create a project** named
   `boarder`. Copy the **project ID** (UUID).
2. Tell Claude the project ID. Claude updates `app.json` to replace the
   `REPLACE_WITH_EAS_PROJECT_ID` placeholders.
3. expo.dev → **Account Settings → Access Tokens** → **Create token**.
   Copy the token.
4. **github.com/verbal76/Idle-game/settings/secrets/actions** →
   **New repository secret** → name `EXPO_TOKEN`, value = the token.

After that, two GitHub Actions workflows handle everything:

- **EAS Update (OTA)** runs on every push to `main` or the dev branch.
  Builds `dist/index.html`, publishes a new bundle to your EAS Update
  channel. Installed apps pick it up on next cold launch.
- **EAS Build (Android APK)** is **manual** (workflow_dispatch). Run it
  when you need a fresh APK to install for the first time or after
  changing native deps.

## Day-to-day flow

- **Code/asset change**: I push → EAS Update workflow runs (~3–5 min) →
  next time you launch the installed app, it fetches the new bundle and
  reloads the game. No reinstall.
- **Need a new APK** (first install or native dep change): you trigger
  **EAS Build (Android APK)** manually from the Actions tab → wait for
  EAS dashboard to show the build done (~10–15 min on EAS's runners) →
  download APK from the EAS dashboard on your phone → install.

## Project layout

```
App.tsx                    Expo entry. Loads dist/index.html into WebView.
index.js                   registerRootComponent shim.
app.json                   Expo + Android config + EAS project link.
eas.json                   EAS Build / Update profiles.
babel.config.js            RN babel preset.
metro.config.js            Adds .html to assetExts so dist/index.html is
                           bundleable.
vite.config.ts             Single-file Vite build (everything inlined into
                           one HTML).
tsconfig.json              Single tsconfig for both web and RN code.
src/                       The actual game.
  main.ts                  Entry. Wires profiles → menu → run loop.
  scene/Game.ts            Babylon scene, rider physics, obstacles.
  scene/Rider.ts           Code-built humanoid + snowboard rig.
  profiles/                IndexedDB profile store.
  input/TwinStickInput.ts  On-screen left stick (steer).
  input/ActionButtons.ts   On-screen JUMP / FLIP buttons.
  ui/                      DOM screens (Profile select, Main menu, HUD).
  world/SeedRng.ts         Deterministic xorshift64 RNG.
.github/workflows/
  eas-update.yml           Auto OTA on every push.
  eas-build.yml            Manual APK build trigger.
```

## Status

v1 skeleton: humanoid rider with snowboard, on-screen left stick steers,
twin action buttons (hold-to-charge JUMP, in-air FLIP), procedural rocks
that end the run on collision, distance + flip counter HUD, profile-select
+ pause + fall overlay flow, IndexedDB-backed local profiles.

The slope is a procedural chain of `SlopeSegment`s — each segment its own
slope angle and length, with cliff drops between segments for jumps, gully
walls flanking each segment, streamed ahead/behind the rider indefinitely.

The v1 plan lives at `/root/.claude/plans/i-want-to-start-smooth-fairy.md`.
Earlier scaffolding (Unity at `beac810`, web/PWA at `8737ea2`, Cloudflare
at `c1b1a49`, Capacitor APK at `8ab0763`) is in git history. The leftover
`Assets/` directory is inert and will be removed incrementally.
