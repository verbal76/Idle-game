// Builds the in-page display copy of the Hot Attic Games studio logo.
//
//   npm i --no-save sharp && node scripts/make-studio-logo.mjs
//
// WHY A COPY: the owner-supplied canonical artwork (Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png,
// repository root, 2.8 MB) is NEVER edited. The game ships to the WebView as ONE inline HTML string
// that fails (black screen) somewhere above ~10 MB over Android's Binder channel, and the page is
// already ~5.8 MB, so inlining the PNG (3.8 MB as base64) is not safe. This writes a WebP of the
// SAME pixels at the SAME 1536x1024 size with the alpha channel kept (quality 95, alpha 100): ~0.45 MB.
//
// A sidecar (src/assets/studio-logo.json) records the canonical file's SHA-256; a unit test fails if
// the canonical artwork changes without this being re-run, so the shipped card can never silently
// show stale art. Run it only when the owner replaces the canonical file.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png';
const OUT = 'src/assets/studio-logo.webp';
const META = 'src/assets/studio-logo.json';

const { default: sharp } = await import('sharp');
const png = readFileSync(SRC);
const m = await sharp(png).metadata();
if (!m.hasAlpha) throw new Error('canonical logo has no alpha channel?');
const webp = await sharp(png).webp({ quality: 95, alphaQuality: 100, effort: 6 }).toBuffer();
const o = await sharp(webp).metadata();
if (o.width !== m.width || o.height !== m.height || !o.hasAlpha) throw new Error('derivative changed size or lost alpha');
writeFileSync(OUT, webp);
writeFileSync(META, JSON.stringify({
  source: SRC,
  sourceSha256: createHash('sha256').update(png).digest('hex'),
  width: m.width, height: m.height, hasAlpha: true,
  format: 'webp', quality: 95, alphaQuality: 100,
  bytes: webp.length,
}, null, 2) + '\n');
console.log(`make-studio-logo: ${SRC} (${png.length} B) -> ${OUT} (${webp.length} B), ${m.width}x${m.height} with alpha`);
