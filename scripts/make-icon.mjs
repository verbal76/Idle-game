// Materialises src/assets/menu-bg.png into assets/icon.png +
// assets/adaptive-icon.png each build. The naive copyFileSync()
// approach passed the source PNG through verbatim, which made
// expo prebuild fail in @expo/image-utils → Sharp:
//
//   at generateImageAsync (.../image-utils/build/Image.js:177)
//   at withAndroidIcons.js:344 (generateIconAsync, mipmap resize)
//   at Promise.all (parallel mipmap density bucket generate)
//
// Sharp / libvips choke on PNGs with non-standard chunks (sRGB
// profiles, animated PNG metadata, weird color-space hints from
// some image editors). Re-encoding via pngjs strips everything
// down to a vanilla 8-bit-per-channel RGBA PNG with just IHDR /
// IDAT / IEND, which is the lowest-common-denominator format
// Sharp accepts cleanly.
//
// pngjs always decodes to 4 bytes per pixel internally regardless
// of input depth/format, so the round-trip normalises the file
// without us having to special-case grayscale / RGB / palettized
// inputs.
//
// Run automatically by `npm run web:build` (which is the EAS
// Build post-install hook), so this fires once per build before
// expo prebuild reads the icons.

import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SRC = 'src/assets/menu-bg.png';
const TARGETS = ['assets/icon.png', 'assets/adaptive-icon.png'];

mkdirSync('assets', { recursive: true });

const decoded = PNG.sync.read(readFileSync(SRC));
const reencoded = PNG.sync.write(decoded);

for (const t of TARGETS) {
  writeFileSync(t, reencoded);
  console.log(`make-icon: ${SRC} → ${t} (${decoded.width}×${decoded.height}, ${reencoded.length} B)`);
}
