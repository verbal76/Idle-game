import { describe, expect, it } from 'vitest';
import { Haptics, PATTERNS } from './haptics';

const rig = () => {
  const calls: Array<number | number[]> = [];
  let t = 0;
  const h = new Haptics(() => (p) => { calls.push(p); return true; }, () => t);
  return { h, calls, advance: (ms: number) => { t += ms; } };
};

describe('haptics (#27)', () => {
  it('plays each event\'s pattern', () => {
    const { h, calls, advance } = rig();
    h.play('trick'); advance(100);
    h.play('crash');
    expect(calls).toEqual([PATTERNS.trick, PATTERNS.crash]);
  });

  it('patterns are short (no buzz over 150 ms, total under 300 ms)', () => {
    for (const p of Object.values(PATTERNS)) {
      const arr = Array.isArray(p) ? p : [p];
      expect(Math.max(...arr)).toBeLessThanOrEqual(150);
      expect(arr.reduce((a, b) => a + b, 0)).toBeLessThan(300);
    }
  });

  it('a landing thud right after another buzz is merged away', () => {
    const { h, calls, advance } = rig();
    h.play('trick'); advance(10);
    h.play('land');
    expect(calls).toEqual([PATTERNS.trick]);
    advance(100);
    h.play('land');
    expect(calls).toHaveLength(2);
  });

  it('turned off: never vibrates', () => {
    const { h, calls } = rig();
    h.setEnabled(false);
    h.play('crash'); h.play('trick');
    expect(calls).toEqual([]);
  });

  it('no Vibration API (desktop, tests): silent, no throw', () => {
    const h = new Haptics(() => null);
    expect(() => h.play('crash')).not.toThrow();
    const throwing = new Haptics(() => () => { throw new Error('blocked'); });
    expect(() => throwing.play('bail')).not.toThrow();
  });
});
