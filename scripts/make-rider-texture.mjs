// Builds src/assets/rider-texture.png from the Kenney character template
// (src/assets/character-texture.png): same UV layout, but dressed like
// the rider in the menu art instead of a crash-test dummy — black
// helmet, orange-red goggles, face, jacket zip — and the crash-test
// markers removed. Deterministic; re-run after editing:
//   node scripts/make-rider-texture.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const img = PNG.sync.read(readFileSync('src/assets/character-texture.png'));
const W = img.width;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const put = (x, y, c) => { const i = (y * W + x) * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255; };
const get = (x, y) => { const i = (y * W + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, typeof c === 'function' ? c(x, y) : hex(c)); };
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const vgrad = (y0, y1, stops) => (x, y) => {
  const t = (y - y0) / (y1 - y0);
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
    const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
    return mix(hex(c0), hex(c1), (t - t0) / (t1 - t0));
  }
  return hex(stops[stops.length - 1][1]);
};
// Paint over a marker with the colour found just left of it, row by row.
const erase = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) { const c = get(x0 - 4, y); for (let x = x0; x < x1; x++) put(x, y, c); } };

const HELMET = '#24262c', RIDGE = '#3b3e47', STRAP = '#141519', SKIN = '#e2a67e', NECK = '#c98e68', HAIR = '#4a2e1c';

// ── Head (cross layout, 128 px faces: top 128-256/0-128; row 128-256:
//    side 0-128, face 128-256, side 256-384, back 384-512; chin below).
rect(128, 0, 256, 128, HELMET);
for (let y = 20; y < 128; y += 36) rect(128, y, 256, y + 6, RIDGE);
rect(0, 128, 512, 176, HELMET);
rect(0, 150, 512, 156, RIDGE);
rect(0, 176, 512, 200, STRAP);
rect(0, 200, 128, 240, SKIN);
rect(256, 200, 384, 240, SKIN);
rect(384, 200, 512, 240, HAIR);
rect(0, 240, 512, 256, STRAP);
rect(128, 256, 256, 384, NECK);
// Face: goggles (black frame, orange-to-red lens), then two dark marks
// below them, as on the rider in the menu art.
rect(128, 168, 256, 210, '#0f1013');
rect(136, 175, 248, 203, vgrad(175, 203, [[0, '#ffd23a'], [0.45, '#ff7a1c'], [1, '#d8243a']]));
rect(150, 178, 174, 183, '#fff1b8');
rect(128, 210, 256, 240, SKIN);
rect(166, 216, 176, 234, '#1c1d22');
rect(208, 216, 218, 234, '#1c1d22');

// ── Crash-test markers off the torso, arms and legs.
rect(128, 806, 194, 872, '#ffc044');
erase(492, 614, 534, 682);
erase(908, 614, 950, 682);
erase(494, 942, 532, 996);
erase(910, 942, 948, 996);

// ── Jacket: centre zip and two pocket zips on the front.
rect(157, 784, 163, 890, '#1b1c21');
rect(116, 836, 120, 872, '#1b1c21');
rect(200, 836, 204, 872, '#1b1c21');

writeFileSync('src/assets/rider-texture.png', PNG.sync.write(img));
console.log('wrote src/assets/rider-texture.png');
