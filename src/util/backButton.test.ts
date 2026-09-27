import { describe, expect, it } from 'vitest';
import { handleBack, pushBackHandler } from './backButton';

describe('back button routing (#2)', () => {
  it('lets the newest handler consume the press, and reports unhandled presses', () => {
    const calls: string[] = [];
    expect(handleBack()).toBe(false);
    const popA = pushBackHandler(() => { calls.push('a'); return true; });
    const popB = pushBackHandler(() => { calls.push('b'); return false; });
    expect(handleBack()).toBe(true);
    expect(calls).toEqual(['b', 'a']);
    popB(); popA();
    expect(handleBack()).toBe(false);
  });
});
