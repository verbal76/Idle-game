# Where's the Bottom?

A low-poly snowboarding game for Android phones. The whole game is a
Babylon.js + TypeScript web build that runs inside a thin Expo WebView
shell. Almost every change ships **over the air** (EAS Update), so an
installed APK picks up new versions without a reinstall.

## The game

Two modes, picked from the main menu:

- **Downhill (idle)** — an endless procedural mountain: slope segments of
  varying pitch, cliff drops, rocks, trees, kickers. The rider cruises on
  their own; you steer, carve, jump and flip. Pays **1 ❄ per 50 m** (×
  Flake Bonus) plus tricks. A rock ends the run.
- **Half-pipe** — an active bowl with speed strips, magenta rings (streaks)
  and lips that bounce you back in. Built for chaining tricks.

### Controls (on-screen)

| Control | What it does |
| --- | --- |
| ◀ ▶ | Steer; in the air, spin the board |
| **CARVE** (curved arrow) | Hold for a deeper, tighter carve (~40% more lean) |
| **JUMP** | Hold to charge, release to jump (charge bar on the right) |
| **FLIP** | Front flip; **FLIP + CARVE** = back flip |
| ⏸ / Android Back | Pause (Back again resumes). Backgrounding the app pauses too |

### Tricks and payouts

- Flip: 1 ❄ per flip, back flips +25%. Spins: 0.5 ❄ per 180°.
- Landing is judged on how far the board is from the flight direction:
  **clean** within 30°, **sketchy** 30–60° (lands, no pay, speed loss),
  **bail** 60–120° (a 1.5 s tumble and 1.5 s recovery).
- Landing backward rides **switch**: switch spins pay +50%; the rider turns
  back around after 1.5 s.
- **Cork**: a flip and a 180+ spin in the same jump pays (flip + spin) ×1.5.
- Chaining clean landings inside the combo window raises the **combo
  multiplier**. Every landing pops a callout with its name and payout.

Snowflakes keep their fractions: the screen shows whole ❄, the save keeps
the exact amount.

### Progression

- **Upgrades** (Upgrades screen, or from pause / the run summary): Top
  Speed, Jump Power, Edge Grip, Charge Rate, Spin Speed, Flip Speed, Flake
  Bonus, Ring Magnet, Combo Window (20 levels each) and **Grace** (4 levels,
  40/80/120/160 ❄ — each level turns one run-ending hit per run into a
  bail). Each row shows the current → next value and level pips.
- **Run summary** after every run: earnings by source (distance, tricks,
  rings, goals) and this run against your records, with **NEW BEST**
  badges.
- **Milestones** (15, one-time, 10–100 ❄) and **daily challenges** (3 per
  local day, 15 ❄ each, +20 for all three). Both pay automatically when a
  run is banked; progress is on the **Stats** screen.
- **Stats**: per-mode records (Downhill distance / flips; Half-pipe best
  run, ring streak, combo), lifetime totals, today's challenges and
  milestones. Open it from the main menu or 📊 in the profile picker.

### Saves

- Several local profiles, stored in IndexedDB inside the WebView.
- A run in progress is mirrored into the profile every 2 s. If the app is
  killed or crashes mid-run, the next launch shows **Run interrupted** with
  the same summary; **Collect** banks it exactly once.
- Old saves are upgraded in place on load (`src/profiles/migrate.ts`);
  nothing a player earned is ever reset.
- A downloaded OTA never reloads the app mid-run; it waits until you are
  back on the menus with the run saved.

### Settings

Music volume, sound-effect volume (all effects are synthesized — no audio
files), vibration on/off, skip track, manual update check, About, bug
report and feature request.

At the bottom, **Build / Update Info** shows what the phone is actually
running, read at runtime: the installed APK's app version and Android
build (versionCode), the runtime version and update channel, whether the
code came from the APK itself or a downloaded OTA, and for an OTA its
name, update ID, publish time, source commit and branch ("Show full IDs"
and Copy for bug reports). Anything that can't be read says
"Unavailable".

## How it's built

| Piece | Role |
| --- | --- |
| **Babylon.js + TypeScript + Vite** | The game. A single-file Vite build inlines everything into `dist/index.html`. |
| `scripts/embed-html.mjs` | Embeds that HTML as a string in `src/__generated__/html-bundle.ts`. |
| **Expo + react-native-webview** (`App.tsx`) | Native shell: loads the embedded HTML, forwards Android Back, locks orientation during runs, runs the OTA check (and defers the reload while a run is active). |
| **EAS Update** | Publishes the JS bundle (shell + embedded game) to the `preview` channel. Runtime version comes from the app version (`0.0.1`). |
| **GitHub-hosted Gradle build** | Produces the APK when native files change. |

`App.tsx` itself ships over the air (it is JS), so shell behaviour such as
the Back button bridge or update deferral does not need an APK.

### OTA vs APK

- **OTA** (the normal case): any change under `src/`, `App.tsx`,
  `index.html`, `scripts/`. Pushing to `main`, `Github-APK-Transition-snow`
  or the gameplay-review branch runs **EAS Update (OTA)**: install → unit
  tests → build → smoke test of the built game → publish to EAS branch
  `preview` (channel `preview` → branch `preview`) → **delivery check**: the
  workflow asks the update server exactly what an installed APK asks
  (runtime version and channel from `app.json`) and fails unless it gets
  back the update it just published. A failing test blocks the publish.
- Each OTA carries its commit, name ("OTA #NN" from the commit subject),
  message, run number and branch in its manifest (`app.config.js` adds
  them as `extra.ota` from the workflow's env), which is what Build /
  Update Info displays.
- **APK** (rare): changes to `app.json`, `app.config.js`, `eas.json`,
  Babel/Metro config, native folders, the icon art, or runtime
  `dependencies` in `package.json` (not devDependencies or scripts). On
  `main` / `Github-APK-Transition-snow` these run **APK Build** (unit
  tests → prebuild → Gradle); the APK is attached to a GitHub Release. A
  new native module (e.g. `expo-haptics`) needs one.
- **Never both at once, enforced.** Both workflows first run
  `.github/scripts/release-route.sh` on the pushed commit range: a push
  that changes the native build goes APK-only (the OTA job is skipped); a
  JS-only push goes OTA-only. After a native push, publish the matching
  OTA by hand (Actions → EAS Update → Run workflow) once the APK build has
  finished. `src/test/releaseRoute.test.ts` pins this behaviour.
- The runtime version follows `expo.version`: bump it with every native
  change, or an OTA built for the new native code could reach older APKs.
- Bump `OTA_VERSION` in `src/version.ts` for each OTA and `BUILD_VERSION`
  for each APK (shown in About); Build / Update Info reads the real
  values at runtime.

## Developing

```bash
npm install
npm run web:dev          # Vite dev server (desktop browser)
npm run web:build        # production build → dist/ + embedded bundle
npm test                 # unit + headless game tests (Vitest)
npm run test:smoke       # drives the built game in Chromium (Playwright)
npm run check            # tsc + unit tests
npm run perf:runstart    # run-start timing benchmark
```

The smoke test needs `npm run web:build` first and a Chromium; set
`CHROMIUM_PATH` if it isn't at the default location.

### Tests

- **Pure logic** (`src/game/*.test.ts`, `src/profiles`, `src/util`,
  `src/audio`): economy and fractions, tricks and landing judgement,
  upgrades and shop, records, goals, pending-run recovery, migrations,
  sound and vibration.
- **Headless game** (`src/scene/*.test.ts`): the real `Game` on Babylon's
  NullEngine with a fixed 60 Hz clock and scripted input — collisions,
  bails, spins, carving, pause, distance pay, upgrades, and **golden
  traces** (`__snapshots__/`) that pin whole rides frame by frame.
- **Smoke** (`scripts/smoke.mjs`): profile creation, both modes, pause and
  Back, app kill + Run interrupted, run summary, goals, OTA deferral,
  upgrades, layout (nothing clipped in portrait or landscape, 320 px
  phones), HUD, trick callouts, sound and vibration settings, Build /
  Update Info, a damaged save, and a non-fatal background error. Fails on
  any page error.

## Project layout

```
App.tsx                  Expo shell: WebView, Back button, orientation, OTA check/defer
app.json, eas.json       Expo / EAS config (runtimeVersion = app version)
app.config.js            Adds each OTA's publish metadata (extra.ota) on top of app.json
index.html               Vite entry
src/
  main.ts                Screens and the run loop (bank, summary, pending run, goals)
  version.ts             OTA / build labels shown in About
  style.css              All UI styling
  scene/                 Babylon: Game (physics, tricks, pickups), Stage (shared
                         engine + assets), Terrain, ChunkStreamer, Rider,
                         half-pipe geometry, environment
  game/                  Pure rules: economy, tricks, carve, collision, jump
                         charge, upgrades, shop, records, goals, summary,
                         callouts, pending run
  profiles/              IndexedDB store, ProfileService, save migrations
  ui/                    DOM screens: menus, HUD, upgrades, stats, settings,
                         run summary, run interrupted, callouts, about
  audio/                 Music player, synthesized sound effects
  input/                 On-screen arrow pad and action buttons
  shell/updateGate.ts    "Don't reload mid-run" logic used by App.tsx
  shell/buildInfo.ts     Build / Update Info: metadata -> display rows
  util/                  Back button stack, haptics, escaping, helpers
  world/SeedRng.ts       Deterministic RNG (per-chunk seeds)
  test/                  Headless Babylon + game harness for tests
scripts/                 Build helpers, smoke test, perf benchmark
.github/workflows/       CI, EAS Update (OTA), APK build, artifact pruning
MOBILE_GAME_DEV_RULES.md Working rules for this project
```
