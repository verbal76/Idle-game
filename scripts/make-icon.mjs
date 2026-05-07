// Procedurally generates assets/icon.png and assets/adaptive-icon.png:
// a stylized snowboarder silhouette mid-flip on a dark blue rounded square.
// Pure-JS via pngjs so it runs in any node env (EAS Build, GitHub Actions).
//
// Run automatically as part of npm run web:build.

import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'node:fs';

const SIZE = 1024;
const CORNER = 192;

const BG = [0x0b, 0x13, 0x20];
const HALO = [0x1d, 0x2e, 0x4d];
const FG = [0xee, 0xf3, 0xff];
const ACCENT = [0xe8, 0x5a, 0x3c];

const png = new PNG({ width: SIZE, height: SIZE });

function setPx(x, y, c) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const idx = (SIZE * y + x) << 2;
  png.data[idx] = c[0];
  png.data[idx + 1] = c[1];
  png.data[idx + 2] = c[2];
  png.data[idx + 3] = 255;
}

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx0 = x0 + r, cx1 = x1 - r;
  const cy0 = y0 + r, cy1 = y1 - r;
  if (x >= cx0 && x <= cx1) return true;
  if (y >= cy0 && y <= cy1) return true;
  const cx = x < cx0 ? cx0 : cx1;
  const cy = y < cy0 ? cy0 : cy1;
  return Math.hypot(x - cx, y - cy) <= r;
}

const CX = SIZE / 2;
const CY = SIZE / 2;
const ANGLE = -Math.PI / 6; // -30° tilt for that mid-flip lean
const COS_A = Math.cos(-ANGLE);
const SIN_A = Math.sin(-ANGLE);

function toLocal(x, y) {
  const dx = x - CX;
  const dy = y - CY;
  return [dx * COS_A - dy * SIN_A, dx * SIN_A + dy * COS_A];
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function inBoarder(x, y) {
  const [lx, ly] = toLocal(x, y);
  // Snowboard: long ellipse-ish along local X.
  if ((lx / 320) ** 2 + ((ly - 120) / 50) ** 2 < 1) return true;
  // Bindings nubs.
  if (Math.hypot(lx + 90, ly - 90) < 32) return true;
  if (Math.hypot(lx - 90, ly - 90) < 32) return true;
  // Legs.
  if (distToSegment(lx, ly, -90, 90, -50, -10) < 38) return true;
  if (distToSegment(lx, ly,  90, 90,  50, -10) < 38) return true;
  // Torso.
  if (distToSegment(lx, ly, 0, -10, 0, -150) < 70) return true;
  // Front arm reaching forward.
  if (distToSegment(lx, ly, 30, -90, 200, -180) < 28) return true;
  // Back arm tucked.
  if (distToSegment(lx, ly, -40, -100, -150, -60) < 28) return true;
  // Head.
  if (Math.hypot(lx, ly - 210) < 80) return true;
  return false;
}

function inAccent(x, y) {
  // Beanie band on the head.
  const [lx, ly] = toLocal(x, y);
  return Math.hypot(lx, ly - 250) < 80 && ly < -240 && ly > -290;
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const inBg = inRoundedRect(x, y, 16, 16, SIZE - 16, SIZE - 16, CORNER);
    if (!inBg) {
      // Outside the rounded square: leave fully transparent so launchers can mask.
      const idx = (SIZE * y + x) << 2;
      png.data[idx + 3] = 0;
      continue;
    }
    // Soft radial halo.
    const dx = x - CX;
    const dy = y - CY;
    const r = Math.hypot(dx, dy);
    const halo = Math.max(0, 1 - r / (SIZE * 0.55));
    const bg = [
      Math.round(BG[0] * (1 - halo) + HALO[0] * halo),
      Math.round(BG[1] * (1 - halo) + HALO[1] * halo),
      Math.round(BG[2] * (1 - halo) + HALO[2] * halo)
    ];
    let c = bg;
    if (inBoarder(x, y)) c = FG;
    if (inAccent(x, y)) c = ACCENT;
    setPx(x, y, c);
  }
}

mkdirSync('assets', { recursive: true });
const buf = PNG.sync.write(png);
writeFileSync('assets/icon.png', buf);
writeFileSync('assets/adaptive-icon.png', buf);
console.log('make-icon: wrote assets/icon.png and assets/adaptive-icon.png');
