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
| **Steering strip** (left thumb) | Touch anywhere on it: near the centre notch is a gentle correction, further out turns harder, the outer ends **carve** (deeper, tighter, ~40% more lean). In the air, spin the board |
| **JUMP** | Hold to charge, release to jump (charge bar on the right) |
| **FLIP** | Front flip; **FLIP while carving** = back flip |
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

**About** shows the game's name and version. One tap on "Build & update
details" shows what the phone is actually running, read at runtime: the
installed APK's app version and Android build (versionCode), the runtime
version and update channel, whether the code came from the APK itself or a
downloaded OTA, and for an OTA its name, update ID, publish time, source
commit and branch ("Show full IDs" and Copy for bug reports). Anything that
can't be read says "Unavailable".

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

### Release process (the rules the workflows enforce)

**Authoritative release line.** OTAs publish only from
`claude/repo-gameplay-review-loq9rq` (and, once the live line is merged,
from `main`). `main` currently lags the live line; its publishing
workflows are disabled stubs, and `Github-APK-Transition-snow` likewise
(a stale branch that publishes would downgrade every installed player,
because all APKs share one EAS channel). Other old branches still carry
copies of the old workflows; never push to them or run their workflows.
When PR #64 is merged, take the live line's `eas-update.yml` and
`eas-build.yml`.

**OTA route** (`.github/workflows/eas-update.yml`, the normal case, any
change under `src/`, `App.tsx`, `index.html`, `scripts/`):
route -> lint -> unit tests -> `web:build` -> smoke -> page-size budget
(7.5 MB) -> **ancestry guard** (the live update's source commit must be
an ancestor of this commit: no rollbacks) -> publish to EAS branch
`preview` -> channel re-link -> **delivery check** (asks the update
server what an installed APK asks and requires the new update). One
publish runs at a time (global concurrency group, never cancelled).

**Native route** (`.github/workflows/eas-build.yml`, rare; builds an APK
from `main` only, attached to a GitHub Release): changes to `app.json`,
`app.config.js`, `eas.json`, Babel/Metro config, native folders, the icon
art, runtime `dependencies` in `package.json`, or the lockfile's resolved
version of a native-carrying package (`expo*`, `react-native*`, `react`,
`@expo/*`, `@react-native*`). A lockfile change for anything else
(test tooling, Babylon, Vite) is JavaScript and goes OTA.
`.github/scripts/release-route.sh` decides for both workflows from the
same commit range, so a push is APK-only or OTA-only, never both
(`src/test/releaseRoute.test.ts`). A native change on a branch the APK
workflow doesn't build fails loudly instead of shipping nowhere.

**Runtime version policy.** The runtime version is `expo.version` in
`app.json` (policy `appVersion`; currently 0.0.1). A change to the native
capability set (`app.json`, `android/`, `ios/`, native-carrying
dependencies) MUST bump `expo.version` in the same push or the route
script fails the run: that is what stops an OTA built for new native code
from reaching an older APK that lacks it. Icon art, `app.config.js`,
`eas.json` and Babel/Metro edits rebuild the APK but need no bump. After a
native push, publish the matching OTA by hand (Actions -> EAS Update ->
Run workflow) once the APK is out.

**Signing.** APKs are currently signed with Expo's public debug keystore,
which is NOT acceptable for a public release. Before external testing
expands: create an upload keystore (owner keeps custody; never commit it),
store it in GitHub secrets, build an AAB with `bundleRelease`, enrol in
Play App Signing, and give testers a separate channel from production.
The one-time reinstall this causes is cheapest while the install base is
tiny. Details: `docs/release-architecture.md`.

**Dependencies.** `package-lock.json` is committed; CI uses `npm ci`.
Everything the game runs on in the WebView (Babylon, idb) lives in
`devDependencies` on purpose: it is bundled into the HTML at build time,
and keeping it out of `dependencies` stops a Babylon bump from looking
like a native change. Don't add to `dependencies` unless the APK needs it.

**Build info.** What the phone is running is read at runtime
(`src/shell/buildInfo.ts`): About shows name and version to players;
"Build & update details" (and the bug-report email) show the same rows:
APK version and versionCode, runtime, channel, update ID, source commit
and branch. There are no hand-kept version labels.

**Generated files.** `src/__generated__/` (`build-info.ts`,
`html-bundle.ts`) is build output and git-ignored. `npm run web:build`
creates both; on a fresh clone `scripts/ensure-generated.mjs` writes
harmless placeholders so `tsc`, `lint` and the unit tests run. A
placeholder bundle is never publishable (the OTA workflow checks).

## Developing

```bash
npm install
npm run web:dev          # Vite dev server (desktop browser)
npm run web:build        # production build → dist/ + embedded bundle
npm test                 # unit + headless game tests (Vitest)
npm run lint             # promise/async correctness lint (ESLint)
npm run test:smoke       # drives the built game in Chromium (Playwright)
npm run check            # tsc + lint + unit tests
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
  input/                 Steering strip (progressive steering + carve) and action buttons
  shell/updateGate.ts    "Don't reload mid-run" logic used by App.tsx
  shell/buildInfo.ts     The one source of build/update info: metadata -> rows (About, bug reports)
  util/                  Back button stack, haptics, escaping, helpers
  world/SeedRng.ts       Deterministic RNG (per-chunk seeds)
  test/                  Headless Babylon + game harness for tests
scripts/                 Build helpers, smoke test, perf benchmark
.github/workflows/       CI, EAS Update (OTA), APK build, artifact pruning
MOBILE_GAME_DEV_RULES.md Working rules for this project
```
