import { describe, expect, it } from 'vitest';
import { judgeLanding } from './tricks';

const deg = (d: number) => d * Math.PI / 180;

describe('spin landings (#11)', () => {
  it('lands clean within 30° of forward or backward; backward rides switch', () => {
    expect(judgeLanding(0, deg(20))).toMatchObject({ outcome: 'clean', switch: false, halfTurns: 0, isTrick: false });
    expect(judgeLanding(0, deg(360 - 25))).toMatchObject({ outcome: 'clean', switch: false, halfTurns: 2, isTrick: true });
    expect(judgeLanding(0, deg(180 + 29))).toMatchObject({ outcome: 'clean', switch: true, halfTurns: 1 });
    expect(judgeLanding(0, deg(-540))).toMatchObject({ outcome: 'clean', switch: true, halfTurns: 3 });
  });

  it('30–60° off is sketchy: landed, but no payout and not a trick', () => {
    const l = judgeLanding(0, deg(180 + 45));
    expect(l.outcome).toBe('sketchy');
    expect(l.pay).toBe(0);
    expect(l.isTrick).toBe(false);
  });

  it('near sideways (60–120°) bails — it used to be clamped and scrubbed instead', () => {
    for (const d of [65, 90, 115, 245, 270, -90]) {
      expect(judgeLanding(0, deg(d)).outcome).toBe('bail');
    }
  });

  it('pays 0.5 per 180 and ×1.5 on the spin when landed switch', () => {
    expect(judgeLanding(0, deg(360)).pay).toBeCloseTo(1.0);        // 360 forward
    expect(judgeLanding(0, deg(180)).pay).toBeCloseTo(0.75);       // 180 switch: 0.5 × 1.5
    expect(judgeLanding(0, deg(540)).pay).toBeCloseTo(2.25);       // 540 switch: 1.5 × 1.5
    expect(judgeLanding(0, deg(720)).pay).toBeCloseTo(2.0);
  });

  it('flips still pay 1 each and need to come round upright', () => {
    expect(judgeLanding(deg(360), 0)).toMatchObject({ outcome: 'clean', flips: 1, pay: 1, name: 'FLIP' });
    expect(judgeLanding(deg(720), 0).name).toBe('DOUBLE FLIP');
    expect(judgeLanding(deg(250), 0).outcome).toBe('bail');         // under-rotated
  });

  it('a 180 out of switch lands regular: no switch bonus', () => {
    const l = judgeLanding(0, deg(180), true);
    expect(l.switch).toBe(false);
    expect(l.pay).toBeCloseTo(0.5);
    expect(judgeLanding(0, deg(360), true).switch).toBe(true);     // still switch after a 360
  });

  it('names spins', () => {
    expect(judgeLanding(0, deg(180)).name).toBe('SWITCH 180');
    expect(judgeLanding(0, deg(360)).name).toBe('360');
  });
});

describe('back flips and corks (#12)', () => {
  it('a back flip (negative rotation) pays +25%', () => {
    expect(judgeLanding(deg(-360), 0)).toMatchObject({ outcome: 'clean', flips: 1, backFlip: true, name: 'BACK FLIP' });
    expect(judgeLanding(deg(-360), 0).pay).toBeCloseTo(1.25);
    expect(judgeLanding(deg(-720), 0).name).toBe('DOUBLE BACK FLIP');
    expect(judgeLanding(deg(-720), 0).pay).toBeCloseTo(2.5);
  });

  it('flip + spin is a cork: (flip + spin) × 1.5 before combo', () => {
    const c = judgeLanding(deg(360), deg(360));
    expect(c).toMatchObject({ cork: true, name: 'CORK 360' });
    expect(c.pay).toBeCloseTo((1 + 1) * 1.5);
    const sc = judgeLanding(deg(-360), deg(540));
    expect(sc).toMatchObject({ cork: true, switch: true, backFlip: true, name: 'SWITCH BACK CORK 540' });
    expect(sc.pay).toBeCloseTo((1.25 + 1.5 * 1.5) * 1.5);
    expect(judgeLanding(deg(720), deg(360)).name).toBe('DOUBLE CORK 360');
  });

  it('a flip alone or a spin alone is not a cork', () => {
    expect(judgeLanding(deg(360), deg(20)).cork).toBe(false);
    expect(judgeLanding(0, deg(360)).cork).toBe(false);
  });
});
