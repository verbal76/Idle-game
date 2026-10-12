// Copies the curated subset of the owner-supplied input-prompt pack
// (Source.zip) into src/assets/glyphs/ BYTE FOR BYTE and writes glyphs.json
// (source path, SHA-256 of every file, the archive SHA-256). Files are only
// renamed to their physical slot (south.png, lb.png, ...), never edited.
// Usage: node scripts/import-glyphs.mjs <extracted Source dir> <Source.zip>
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [srcDir, zipPath] = process.argv.slice(2);
if (!srcDir || !zipPath) { console.error('usage: import-glyphs.mjs <Source dir> <Source.zip>'); process.exit(2); }
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const out = new URL('../src/assets/glyphs/', import.meta.url).pathname;

const FAMILIES = {
  xbox: ['XGamepad/Default', {
    south: 'T_X_A_Color', east: 'T_X_B_Color', west: 'T_X_X_Color', north: 'T_X_Y_Color',
    lb: 'T_X_LB', rb: 'T_X_RB', lt: 'T_X_LT', rt: 'T_X_RT',
    dpad: 'T_X_Dpad', 'dpad-left': 'T_X_Dpad_Left', 'dpad-right': 'T_X_Dpad_Right',
    'stick-l': 'T_X_L_2D',
    // Xbox Menu exists only inside T_X_Sprite.png (cell at 0,1680): see prompts.ts.
    sprite: 'T_X_Sprite',
  }],
  playstation: ['P5Gamepad/Default', {
    south: 'T_P5_Cross_Color', east: 'T_P5_Circle_Color', west: 'T_P5_Square_Color', north: 'T_P5_Triangle_Color',
    lb: 'T_P5_L1', rb: 'T_P5_R1', lt: 'T_P5_L2', rt: 'T_P5_R2',
    dpad: 'T_P5_Dpad', 'dpad-left': 'T_P5_Dpad_Left', 'dpad-right': 'T_P5_Dpad_Right',
    'stick-l': 'T_P5_L_2D',
    start: 'T_P5_Options',
  }],
  switch: ['SGamepad/Default', {
    south: 'T_S_B', east: 'T_S_A', west: 'T_S_Y', north: 'T_S_X',
    lb: 'T_S_LB', rb: 'T_S_RB', lt: 'T_S_LT', rt: 'T_S_RT',
    dpad: 'T_S_Dpad', 'dpad-left': 'T_S_Dpad_Left', 'dpad-right': 'T_S_Dpad_Right',
    'stick-l': 'T_S_L_2D',
    start: 'T_S_Plus',
  }],
  keyboard: ['Keyboard_Mouse/White', {
    left: 'T_Left_Key_White', right: 'T_Right_Key_White', up: 'T_Up_Key_White', down: 'T_Down_Key_White',
    space: 'T_Space_Key_White', shift: 'T_Shift_Key_White', f: 'T_F_Key_White',
    esc: 'T_Esc_Key_White', enter: 'T_Enter_Key_White',
  }],
};

const files = [];
for (const [family, [dir, map]] of Object.entries(FAMILIES)) {
  mkdirSync(join(out, family), { recursive: true });
  for (const [slot, base] of Object.entries(map)) {
    const from = join(srcDir, dir, `${base}.png`);
    const to = join(out, family, `${slot}.png`);
    copyFileSync(from, to);
    files.push({ file: `${family}/${slot}.png`, source: `${dir}/${base}.png`, sha256: sha(to) });
    if (sha(from) !== sha(to)) throw new Error(`copy altered ${from}`);
  }
}
writeFileSync(join(out, 'glyphs.json'), JSON.stringify({
  pack: 'Input Prompts (JulioCacko), supplied by the owner as Source.zip',
  archiveSha256: sha(zipPath),
  licenseEvidence: 'Store listing screenshot supplied by the owner shows "CC0 1.0 Universal" for assets and "MIT" for code. The archive itself contains no license file; the owner must confirm against the original download page before release. See docs/THIRD_PARTY_ASSETS.md.',
  modified: false,
  files,
}, null, 2) + '\n');
console.log(`copied ${files.length} glyphs`);
