import { describe, expect, it } from 'vitest';
import { playedAgo } from './ContinuePrompt';

describe('playedAgo (R6 copy)', () => {
  const now = 1_700_000_000_000;
  it('reads like a person would say it', () => {
    expect(playedAgo(now - 30_000, now)).toBe('Played just now');
    expect(playedAgo(now - 5 * 60_000, now)).toBe('Played 5 minutes ago');
    expect(playedAgo(now - 60 * 60_000, now)).toBe('Played 1 hour ago');
    expect(playedAgo(now - 5 * 3600_000, now)).toBe('Played 5 hours ago');
    expect(playedAgo(now - 86400_000, now)).toBe('Played 1 day ago');
    expect(playedAgo(now - 3 * 86400_000, now)).toBe('Played 3 days ago');
    expect(playedAgo(now - 400 * 86400_000, now)).toBe('Played a while ago');
  });
  it('says nothing when unknown or in the future (a clock change)', () => {
    expect(playedAgo(0, now)).toBe('');
    expect(playedAgo(NaN, now)).toBe('');
    expect(playedAgo(now + 5000, now)).toBe('');
  });
});
