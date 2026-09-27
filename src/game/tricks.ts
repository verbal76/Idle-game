// Landing judgement and trick payouts.
//
// Spins are judged by the net air rotation of the board relative to its
// take-off direction: within 30° of forward (0°/360°…) or backward
// (180°/540°…) is clean, 30–60° off is a sketchy landing, anything
// closer to sideways (60–120°) is a bail. Landing backward rides
// "switch". Flips must also come round to within 45° of upright.

const DEG = Math.PI / 180;
export const CLEAN_SPIN_TOL = 30 * DEG;
export const SKETCHY_SPIN_TOL = 60 * DEG;
export const CLEAN_FLIP_TOL = 45 * DEG;

// Payouts (before combo and Flake Bonus).
export const FLIP_PAY = 1;              // per full flip
export const SPIN_PAY_PER_180 = 0.5;
export const SWITCH_SPIN_BONUS = 1.5;   // spin payout ×1.5 when landed switch

export type LandingOutcome = 'clean' | 'sketchy' | 'bail';

export interface Landing {
  outcome: LandingOutcome;
  switch: boolean;          // board ends up backward
  flips: number;            // full flips completed (0 if none)
  halfTurns: number;        // spin rounded to 180s (0 if none)
  residual: number;         // radians off the nearest 180° multiple (signed)
  pay: number;              // snowflakes before combo / Flake Bonus
  isTrick: boolean;         // clean landing of at least one flip or 180
  name: string;             // e.g. "SWITCH 180", "DOUBLE FLIP"
}

/** Angle distance from upright for an accumulated flip rotation. */
function flipOffUpright(flipRotation: number): number {
  const TWO_PI = Math.PI * 2;
  const norm = ((flipRotation % TWO_PI) + TWO_PI) % TWO_PI;
  return Math.min(norm, TWO_PI - norm);
}

const FLIP_WORDS = ['', '', 'DOUBLE ', 'TRIPLE ', 'QUAD '];

/**
 * @param startSwitch the rider took off riding switch; an odd number of
 *   180s then lands them back to regular (no switch bonus).
 */
export function judgeLanding(flipRotation: number, spinRotation: number, startSwitch = false): Landing {
  const halfTurnsRaw = Math.round(spinRotation / Math.PI);
  const residual = spinRotation - halfTurnsRaw * Math.PI;
  const off = Math.abs(residual);
  const halfTurns = Math.abs(halfTurnsRaw);
  const sw = (halfTurns % 2 === 1) !== startSwitch;   // board ends up backward
  const flips = Math.abs(flipRotation) > Math.PI * 1.5
    ? Math.round(Math.abs(flipRotation) / (Math.PI * 2))
    : 0;

  let outcome: LandingOutcome;
  if (flipOffUpright(flipRotation) >= CLEAN_FLIP_TOL || off > SKETCHY_SPIN_TOL) outcome = 'bail';
  else if (off > CLEAN_SPIN_TOL) outcome = 'sketchy';
  else outcome = 'clean';

  const isTrick = outcome === 'clean' && (flips > 0 || halfTurns > 0);
  let pay = 0;
  let name = '';
  if (isTrick) {
    const spinPay = halfTurns * SPIN_PAY_PER_180 * (sw ? SWITCH_SPIN_BONUS : 1);
    pay = flips * FLIP_PAY + spinPay;
    const parts: string[] = [];
    if (sw) parts.push('SWITCH');
    if (halfTurns > 0) parts.push(String(halfTurns * 180));
    if (flips > 0) parts.push(`${flips <= 4 ? FLIP_WORDS[flips] : `${flips}× `}FLIP`);
    name = parts.join(' ');
  }
  return { outcome, switch: sw && outcome !== 'bail', flips, halfTurns, residual, pay, isTrick, name };
}
