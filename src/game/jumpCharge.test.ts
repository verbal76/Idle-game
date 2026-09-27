import { describe, expect, it } from 'vitest';
import { stepJumpCharge, type JumpChargeState } from './jumpCharge';

const fresh = (): JumpChargeState => ({ charge: 0, releaseRequired: false });

describe('stepJumpCharge', () => {
  it('charges while held and launches on release', () => {
    const s = fresh();
    expect(stepJumpCharge(s, true, 0.25, 2)).toBeNull();
    expect(s.charge).toBeCloseTo(0.5);
    expect(stepJumpCharge(s, false, 0.016, 2)).toBeCloseTo(0.5);
    expect(s.charge).toBe(0);
  });

  it('caps charge at 1', () => {
    const s = fresh();
    stepJumpCharge(s, true, 5, 2);
    expect(s.charge).toBe(1);
  });

  it('does not recharge after landing until the button is released (no rubber bounce)', () => {
    const s: JumpChargeState = { charge: 0, releaseRequired: true }; // just landed, still holding
    for (let i = 0; i < 30; i++) expect(stepJumpCharge(s, true, 0.016, 2)).toBeNull();
    expect(s.charge).toBe(0);
    // Releasing opens the gate but launches nothing (no charge built).
    expect(stepJumpCharge(s, false, 0.016, 2)).toBeNull();
    expect(s.releaseRequired).toBe(false);
    // A fresh press charges normally.
    stepJumpCharge(s, true, 0.1, 2);
    expect(s.charge).toBeCloseTo(0.2);
  });
});
