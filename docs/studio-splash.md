# Hot Attic Games studio splash (standing product requirement)

**Every Hot Attic Games application/game opens with the Hot Attic Games studio splash before its own title screen,
menu, onboarding or primary interface.** This is a standing studio requirement; do not remove it and do not wait for a
differently named asset.

## Canonical artwork

`Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png` (repository root). Owner-supplied: 1536x1024 RGBA PNG, SHA-256
`e3d9bb5653eafb783eede827606e7ac73a4e45564a1c25b1ed13ad1429f48c4e`. Never redraw, recreate, crop, distort or edit it.
The old `branding/Hot_Attic_Games_Master_Logo.png` path is obsolete.

## Launch order (cold launch)

APP START -> HOT ATTIC GAMES SPLASH -> the game's own opening/title -> normal game.

- About 2.8 s: 0.3 s fade-in (starts when the logo is visible), 2.2 s hold, 0.3 s fade-out. Silent, no extra text, buttons or effects.
- Logo scaled to fit, aspect ratio kept (`object-fit: contain`, 3:2), never cropped or stretched, transparency kept, safe-area padding, on the app's own start-up colour `#0b1320` (matches the native splash, so no black/white flash).
- It sits ON TOP of the normal start-up (the game keeps loading underneath), so it masks start-up work instead of adding dead time.
- Once per page load: not replayed on navigation or when resuming from the background. (A restart into an applied OTA, or the WebView being recreated, is a new page load and shows it again.)
- Cannot strand the user: a logo that fails to load removes the card at once; a stalled decode is removed by a 4 s backstop; the card never blocks initialization, save loading or the update flow.

## How it is built in THIS project (Expo shell + WebView + Vite game)

- Code: `src/ui/StudioSplash.ts` (+ CSS `.studio-splash` in `src/style.css`), started first thing in `bootstrap()` in `src/main.ts`.
- The WebView page is ONE inline HTML string that fails (black screen) above roughly 10 MB over Android's Binder channel, so the page embeds `src/assets/studio-logo.webp`: a WebP of the same pixels at the same 1536x1024 with alpha (0.45 MB instead of 2.8 MB), generated from the canonical PNG by `node scripts/make-studio-logo.mjs` (needs `npm i --no-save sharp`). `src/assets/studio-logo.json` records the canonical file's SHA-256; `src/ui/StudioSplash.test.ts` fails if the canonical art changes without regenerating. The page-size budget in `eas-update.yml` (7.5 MB) still holds (6.4 MB).
- OTA-capable: YES (page code and assets only, no native change). Native build needed: NO.
- Tests: `src/ui/StudioSplash.test.ts` (canonical file and hash, display copy tied to it, dimensions/alpha, timing, once-per-load, no-strand paths) and the smoke step "studio splash: cold launch ..." (real asset, portrait and landscape: 1536x1024, 3:2, inside the screen, on top, duration, game loads after, no replay on resume). The smoke harness loads pages with `?e2e`, which skips the automatic card (so step reloads stay fast) unless `&studio` is added.

## Changing the artwork

Only the owner replaces `Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png`. Then: run `scripts/make-studio-logo.mjs`, update the pinned hash in `StudioSplash.test.ts` and this file.

## Still desirable on a real phone (cannot be proven by automation)

Perceived cold-start smoothness behind the card, the native-to-card colour hand-off, cutout/gesture-bar phones.
