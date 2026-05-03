# Boarder

Stylized snowboarding PWA, phone-first.

- **Half-pipe** — active twin-stick gameplay. Left stick steers, right-stick
  flick gestures execute spins / flips / grabs. The only on-screen button is
  pause.
- **Downhill** — idle / tap. The rider auto-descends a procedural mountain;
  you only intervene to jump or flip until you fall.

Runs are continuous — there is no restart button. A run ends when the rider
falls; the summary banks currency and returns to the lobby.

## Stack

- **Babylon.js + TypeScript** rendering to a fullscreen WebGL canvas.
- **Vite** + **vite-plugin-pwa** for the build (installable PWA, landscape
  locked, fullscreen on Android Chrome).
- **IndexedDB** (via `idb`) for multiple local profiles, no cloud.
- **GitHub Actions → GitHub Pages** for hosting. A future workflow uses
  Bubblewrap to wrap the PWA into a Trusted Web Activity APK.

## Phone-only dev workflow

1. You prompt Claude in this conversation.
2. Claude edits files via the GitHub MCP and pushes.
3. GitHub Actions builds the site, **enables Pages on first run**, and
   deploys to `https://verbal76.github.io/Idle-game/`.
4. You open that URL on the phone and tap **Install app** — home-screen icon,
   fullscreen, landscape locked.

No PC needed, no clicks in repo settings. Every push to `main` or
`claude/android-snowboarding-game-UHUPI` redeploys automatically.

## Project layout

```
src/
  main.ts                  Entry. Wires profiles → menu → run → menu loop.
  style.css                Fullscreen, landscape, no-zoom, on-screen sticks.
  profiles/
    IndexedDbStore.ts      idb wrapper with profiles + meta object stores.
    ProfileService.ts      Active-profile orchestration on top of the store.
  input/
    TwinStickInput.ts      Pointer-events on-screen sticks (left + right).
  scene/
    Game.ts                Babylon engine, scene, rider, slope chunk stream.
  ui/
    ProfileSelect.ts       Pick / create local profile.
    MainMenu.ts            Pick mode (downhill | half-pipe) or switch profile.
    HUD.ts                 In-run sticks, score, pause overlay.
  world/
    SeedRng.ts             xorshift64 for deterministic procedural worlds.
.github/workflows/
  deploy-pages.yml         Build + auto-enable Pages + deploy on every push.
```

## Status

v0 skeleton: profile select → main menu → boots a Babylon scene where a
capsule rider slides forward over streamed slope chunks, on-screen left stick
steers laterally, pause overlay with Resume / Quit run. Real slope tilt,
physics, half-pipe walls, flick-combo trick scoring, and the idle currency
loop are next.

The v1 plan lives at
`/root/.claude/plans/i-want-to-start-smooth-fairy.md`. The earlier Unity
scaffold (commit `beac810`) is preserved in git history; the leftover
`Assets/` directory in the working tree is inert and will be removed
incrementally.
