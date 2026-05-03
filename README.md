# Boarder

Stylized snowboarding game for Android, built phone-only, distributed as a
sideloaded APK from this private repo's GitHub Actions runs.

- **Half-pipe** — active twin-stick gameplay. Left stick steers, right-stick
  flick gestures execute spins / flips / grabs. The only on-screen button is
  pause.
- **Downhill** — idle / tap. The rider auto-descends a procedural mountain;
  you only intervene to jump or flip until you fall.

Runs are continuous — there is no restart button. A run ends when the rider
falls.

## Stack

- **Babylon.js + TypeScript** rendering to a fullscreen WebGL canvas.
- **Capacitor 6** wraps the build into a native Android WebView app, so the
  game ships as a real APK.
- **Vite** bundles the web layer (and chunk-splits Babylon).
- **IndexedDB** (via `idb`) for multiple local profiles, no cloud.
- **GitHub Actions** builds the APK on every push and uploads it as a
  workflow artifact.

No hosting, no third-party services, no public repo. Everything lives inside
the GitHub repo + your phone's APK install.

## Phone-only dev workflow

1. You prompt Claude in this conversation.
2. Claude edits files via the GitHub MCP and pushes.
3. GitHub Actions runs **Build APK** (~5–10 minutes; first run is the
   slowest because Gradle downloads the Android SDK).
4. On your phone GitHub:
   1. Open the **Actions** tab.
   2. Tap the latest green run titled “Build APK”.
   3. Scroll to the **Artifacts** section at the bottom.
   4. Tap **boarder-debug-apk** to download the ZIP.
   5. Open the ZIP (Files / Chrome downloads), extract
      `boarder-debug.apk`, then tap it to install.
5. **First install**: Android prompts you to enable “Install unknown apps”
   for whichever app you opened the APK from (Chrome, Files, GitHub). Allow
   it once, then install.
6. **Subsequent updates**: just tap the new APK to upgrade in place.

The app id is `com.verbal76.boarder`, name **Boarder**.

## Project layout

```
src/                       Game source (TypeScript + Babylon).
  main.ts                  Entry. Wires profiles → menu → run loop.
  scene/Game.ts            Babylon engine, scene, rider, slope chunk stream.
  profiles/                IndexedDB profile store.
  input/                   On-screen twin-stick (touch).
  ui/                      DOM screens: ProfileSelect, MainMenu, HUD.
  world/SeedRng.ts         Deterministic xorshift64 RNG.
capacitor.config.ts        App id, name, webDir.
vite.config.ts             Bundler + Babylon chunk-split.
.github/workflows/
  android.yml              CI: install → vite build → cap add android
                           → gradle assembleDebug → upload APK artifact.
```

The `android/` directory is regenerated each CI run from
`capacitor.config.ts` and is gitignored — don't commit it.

## Status

v0 skeleton: profile select → main menu → boots a Babylon scene where a
capsule rider slides forward over streamed slope chunks, on-screen left stick
steers laterally, pause overlay with Resume / Quit run. Real slope tilt,
physics, half-pipe walls, flick-combo trick scoring, and the idle currency
loop are next.

The v1 plan lives at
`/root/.claude/plans/i-want-to-start-smooth-fairy.md`. Earlier scaffolding
(Unity at commit `beac810`, web/PWA pivot at `8737ea2`) is preserved in git
history; the leftover `Assets/` directory is inert and will be removed
incrementally.
