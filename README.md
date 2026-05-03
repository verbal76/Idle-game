# Boarder

Stylized snowboarding PWA, phone-first, hosted on Cloudflare Pages.

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
- **Cloudflare Pages** for hosting — free, works with private GitHub repos,
  auto-deploys on every push.

## Phone-only dev workflow

1. You prompt Claude in this conversation.
2. Claude edits files via the GitHub MCP and pushes.
3. Cloudflare Pages detects the push, runs `npm run build`, and deploys to
   `https://idle-game.pages.dev/` (and a per-branch preview URL for the dev
   branch).
4. You open that URL on the phone and tap **Install app** in Chrome —
   home-screen icon, fullscreen, landscape locked.

No PC, no GitHub Pages, no public repo.

## One-time Cloudflare setup (you, in mobile Chrome)

1. Sign up at `cloudflare.com` (email + password, no card needed).
2. **Workers & Pages → Create → Pages → Connect to Git**.
3. Authorize Cloudflare for your GitHub account; scope access to just
   `verbal76/Idle-game`.
4. Pick the repo, then:
   - **Production branch**: `main` (or `claude/android-snowboarding-game-UHUPI`
     while we're working on the dev branch).
   - **Framework preset**: Vite (auto-detected).
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. **Save and Deploy**. First build takes ~2–3 minutes. After that every
   push redeploys automatically.

You'll get two kinds of URLs:
- `https://idle-game.pages.dev/` — the production deployment.
- `https://<commit-sha>.idle-game.pages.dev/` — a unique preview URL per
  push, so you can test changes without affecting production.

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
```

The earlier GitHub Pages deploy workflow has been removed — Cloudflare
handles builds end-to-end now.

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
