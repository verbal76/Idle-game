// Copies src/assets/menu-bg.png to assets/icon.png + assets/adaptive-icon.png
// during the web:build step. Replaces the previous procedural icon
// generator (snowboarder silhouette via pngjs) — now that we have a
// real piece of art committed to src/assets/menu-bg.png, the simplest
// thing is to use it directly. Expo's prebuild handles resizing for
// the mipmap density buckets.
//
// Why a copy instead of just committing assets/icon.png? .gitignore
// excludes assets/icon.png and assets/adaptive-icon.png so the
// Android prebuild output of EAS Build doesn't bloat git history.
// Source-of-truth for the visual lives in src/assets/menu-bg.png;
// this script materialises it into the location app.json points to
// each build.

import { copyFileSync, mkdirSync } from 'node:fs';

const SRC = 'src/assets/menu-bg.png';
const TARGETS = ['assets/icon.png', 'assets/adaptive-icon.png'];

mkdirSync('assets', { recursive: true });
for (const t of TARGETS) {
  copyFileSync(SRC, t);
  // eslint-disable-next-line no-console
  console.log(`make-icon: ${SRC} → ${t}`);
}
