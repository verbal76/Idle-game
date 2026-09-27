import { describe, expect, it } from 'vitest';
import { graceCallout, trickCallout } from './callout';

const t = (name: string, payout = 1, comboMult = 1, outcome: 'clean' | 'sketchy' | 'bail' = 'clean') =>
  ({ name, payout, comboMult, outcome, switch: false });

describe('trick callouts (#25)', () => {
  it('shows the trick name and its payout', () => {
    expect(trickCallout(t('FLIP', 1))).toEqual({ title: 'FLIP', sub: '+1 ❄', tone: 'trick' });
    expect(trickCallout(t('SWITCH 180', 0.75)).sub).toBe('+0.8 ❄');
  });
  it('adds the combo multiplier when chaining', () => {
    expect(trickCallout(t('BACK FLIP', 2.5, 1.5)).sub).toBe('+2.5 ❄ · ×1.5 combo');
  });
  it('bigger treatment for corks, doubles and 540+, not for 180/360', () => {
    expect(trickCallout(t('CORK 360')).tone).toBe('big');
    expect(trickCallout(t('DOUBLE FLIP')).tone).toBe('big');
    expect(trickCallout(t('540')).tone).toBe('big');
    expect(trickCallout(t('SWITCH 180')).tone).toBe('trick');
    expect(trickCallout(t('360')).tone).toBe('trick');
  });
  it('sketchy and bail landings are called out without pay', () => {
    expect(trickCallout(t('SKETCHY', 0, 1, 'sketchy'))).toEqual({ title: 'SKETCHY', sub: 'no pay', tone: 'sketchy' });
    expect(trickCallout(t('BAIL', 0, 1, 'bail'))).toEqual({ title: 'BAIL', sub: '', tone: 'bail' });
  });
  it('grace saves say how many are left', () => {
    expect(graceCallout(1).sub).toBe('1 grace left');
    expect(graceCallout(0)).toEqual({ title: 'SAVED!', sub: '0 graces left', tone: 'grace' });
  });
});
