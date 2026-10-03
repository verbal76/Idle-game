# Store graphics checklist

Play Console requirements (as I know them; confirm current limits in Play Console -> Main store listing, they change):

| Asset | Spec | Required |
|---|---|---|
| App icon | 512 x 512 px, PNG (32-bit, may have alpha), max 1024 KB. Fill the whole square; Google applies its own rounded mask and shadow, so do not bake in rounded corners, borders, shadows, or black corners | Yes |
| Feature graphic | 1024 x 500 px, JPEG or 24-bit PNG (no alpha). Keep text/subject in the central area; it can be cropped on some surfaces | Yes |
| Phone screenshots | 2 to 8 images, JPEG or 24-bit PNG, each side 320 to 3840 px, longest side no more than 2x the shortest. Recommended: 1080 x 1920 (portrait) or 1920 x 1080 (landscape); at least 4 screenshots at 1080 px or more to be eligible for wider promotion | Yes (min 2) |
| 7-inch tablet screenshots | Up to 8, same format rules (e.g. 1200 x 1920 or 1920 x 1200) | Optional |
| 10-inch tablet screenshots | Up to 8, same format rules (e.g. 1600 x 2560 or 2560 x 1600) | Optional (recommended if you want tablet-optimized ranking) |
| Promo video | YouTube URL | Optional |
| In-app (adaptive) launcher icon | Not a store upload, but ships with the app: 108 x 108 dp adaptive layers, content kept inside the central 66 dp circle (about 61 percent of the canvas) | Yes (in the build) |

The game supports portrait and landscape (`orientation: default`; runs lock to landscape per App.tsx). Landscape screenshots (1920 x 1080) match the run view; the menus work in both. Capture both a menu and in-run shots.

## What exists in the repo

| File | Size | Status for the store |
|---|---|---|
| `src/assets/menu-bg.png` | 1254 x 1254 RGB (opaque) | Square art of the yellow-jacket rider with a **rounded-rectangle frame baked in**: black pixels in all four corners and a light blue-grey / dark-blue border band around the edge (about 20 px of black then a grey-blue band along the top edge, verified by pixel sampling: row 0 = black, row ~20 = light blue-grey, row ~40 = saturated blue). **Not usable as a store icon as is.** |
| `assets/icon.png` and `assets/adaptive-icon.png` | 1254 x 1254 | Byte-identical re-encodes of menu-bg.png, written by `scripts/make-icon.mjs` (git-ignored, regenerated every `npm run web:build`). Both inherit the black corners and band. `app.json` uses `icon.png` as `icon` and `adaptive-icon.png` as the adaptive **foreground** over `#0b1320`. |
| `src/assets/splash-bg.png` | 941 x 1672 RGB | Full-bleed portrait art of the same rider (goggles, snow spray, board), no frame, no band. Best in-repo source for new store art. Used as the in-game menu background (src/style.css line ~47). |
| `src/assets/settings-gear.png` | 1262 x 1246 RGBA | UI gear icon, not store material. |
| `public/icon.svg`, `dist/icon.svg` | 512 x 512 SVG | Old placeholder (dark navy rounded square with a stick-figure rider). Not referenced by app.json. Do not use. |
| Gameplay screenshots | none in the repo | **Missing.** |
| Feature graphic | none | **Missing.** |
| Fonts for text on graphics | Lilita One and Fredoka (SIL OFL, in src/assets/fonts) | Usable for the title lettering; OFL permits embedding in graphics. |

## Status of the launcher icon (important)

1. **Black corners and blue-grey band**: the source art has a baked rounded frame. On the Play 512 icon and on launchers the corner pixels render solid black and the edge band shows as a stripe. Fix by sourcing a full-bleed square without the frame (crop from splash-bg.png or re-export the art without the frame).
2. **Adaptive icon has no safe-zone padding**: `adaptive-icon.png` is the full 1254 px art. Android masks the adaptive layer to a circle / squircle and only guarantees the central 66 dp of 108 dp (61 percent). In the art the rider's left glove sits near x = 10 percent and the board's right tip near x = 84 percent, so a circular mask will clip them, and the framed corners will show. Fix: make a 1024 x 1024 **foreground** with the rider scaled into the central ~60 percent over a transparent background, and use a matching solid or gradient **background** colour/layer (sky blue sampled from the art, or the existing `#0b1320`). Optionally add `android.adaptiveIcon.monochromeImage` for themed icons (single-colour silhouette).
3. **Expo prebuild/Sharp**: `scripts/make-icon.mjs` re-encodes to plain RGBA PNG to avoid Sharp failures. Keep that step for new icons (or commit the finished PNGs and remove the generated-copy step; they are .gitignored today).
4. Changing the icon is a **native change** (needs a new build, see release-track-plan.md); the workflow already routes icon source changes to the APK build (`src/assets/menu-bg.png` is in eas-build.yml paths). If you add new icon source files, add them to that list.

## Reuse plan

| Deliverable | Source | How |
|---|---|---|
| 512 x 512 store icon | splash-bg.png | Square crop around the head/goggles/torso (roughly x 0 to 941, y 150 to 1090 of the 941 x 1672 original, then scale to 512). Full bleed, no rounded corners. |
| Adaptive foreground (1024 x 1024) | same crop | Scale subject into the central 61 percent, transparent surround; background layer = sky blue / `#0b1320`. |
| 1024 x 500 feature graphic | splash-bg.png plus title text | Scale width to 1024 (about x1.09), crop a 500 px band across goggles and board, overlay "Where's the Bottom?" in Lilita One. Or compose from in-game landscape screenshots. |
| Phone screenshots | In-game captures | Capture from a real device or emulator at 1080 x 1920 and 1920 x 1080: main menu, downhill run with a flip callout, half-pipe run, run summary with NEW BEST, Upgrades, Stats. `scripts/smoke.mjs` drives the built game in Chromium with Playwright and could be adapted to save screenshots, but it is not a screenshot tool today. |
| Tablet screenshots | In-game captures on a tablet or emulator | Optional. |

Generating these assets needs image tooling (a graphic editor or a small pngjs script, as make-icon.mjs does); I did not produce any binary here.

## Provenance of the art (OWNER TO CONFIRM)

- menu-bg.png, splash-bg.png and settings-gear.png are described in commits as "supplied" art (e.g. "the supplied metallic gear", "new full-bleed snowboarder background"). The repo records no author, tool, or licence for them. The store icon and feature graphic would be built from this art, so the owner must confirm they own or have the rights to use it commercially (and, if it was AI-generated, which tool and what its terms say). Treat as an open item before upload.
- Kenney models (character.obj, tree-pine-basic.obj, tree-pine-detailed.obj, ramps/ramp.obj) carry the header "Created by Kenney (www.kenney.nl)". Kenney's assets are published under CC0 (public domain), but that is from Kenney's site, not recorded in this repo. The rocks, flowers, log and tent `.stl` files carry no header; their file names match Kenney's Nature Kit naming, but provenance is not recorded. OWNER TO CONFIRM source and licence of each pack and keep a record (e.g. a CREDITS file).
- Fonts: Fredoka (Copyright 2016 The Fredoka Project Authors) and Lilita One (Copyright 2011 Juan Montoreano) under SIL OFL 1.1; licence texts are in src/assets/fonts. The woff2 files are embedded into the single HTML bundle, and the licence text files are not shipped in the app. OFL asks that copies keep the copyright notice and licence. Recommended: add an in-app Credits section (JS-only, OTA-able) and/or a page on the privacy-policy site listing the fonts, Kenney assets and music.
