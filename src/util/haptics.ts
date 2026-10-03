// Vibration feedback (#27). Uses the Web Vibration API inside the
// WebView for now; a native haptics engine (expo-haptics) would need a
// new APK, so the bridge is left as a hook for later.

export type HapticKind = 'land' | 'trick' | 'bigTrick' | 'sketchy' | 'bail' | 'crash' | 'grace' | 'purchase' | 'deny';

/** Milliseconds: a single buzz, or on/off/on… patterns. */
export const PATTERNS: Record<HapticKind, number | number[]> = {
  land: 12,
  trick: 20,
  bigTrick: [20, 40, 30],
  sketchy: [15, 30, 15],
  bail: 60,
  crash: [80, 40, 120],
  grace: [30, 40, 30],
  purchase: 15,
  deny: [18, 40, 18],
};

// Two buzzes closer than this are merged (a trick lands with its thud).
const MIN_GAP_MS = 60;

type Vibrate = (pattern: number | number[]) => boolean;

export class Haptics {
  private enabled = true;
  private lastAt = -Infinity;

  constructor(
    private readonly vibrate: () => Vibrate | null = defaultVibrate,
    private readonly now: () => number = () => performance.now(),
  ) {}

  setEnabled(on: boolean): void { this.enabled = on; }
  isEnabled(): boolean { return this.enabled; }

  play(kind: HapticKind): void {
    if (!this.enabled) return;
    const t = this.now();
    // The bigger event wins inside the merge window (crash after a land).
    if (t - this.lastAt < MIN_GAP_MS && kind === 'land') return;
    const v = this.vibrate();
    if (!v) return;
    this.lastAt = t;
    try { v(PATTERNS[kind]); } catch { /* unsupported: ignore */ }
  }
}

function defaultVibrate(): Vibrate | null {
  const n = typeof navigator !== 'undefined' ? navigator as Navigator & { vibrate?: Vibrate } : null;
  return n && typeof n.vibrate === 'function' ? n.vibrate.bind(n) : null;
}

export const haptics = new Haptics();
