import { describe, expect, it } from 'vitest';
import { pickNext, type Box } from './menuNav';

const box = (l: number, t: number, w = 100, h = 40): Box => ({ left: l, top: t, right: l + w, bottom: t + h });

describe('focus movement', () => {
  const column = [box(0, 0), box(0, 60), box(0, 120), box(0, 180)];
  it('moves down and up a list', () => {
    expect(pickNext(column, 0, 'down')).toBe(1);
    expect(pickNext(column, 2, 'up')).toBe(1);
  });
  it('wraps vertically: a list never dead-ends', () => {
    expect(pickNext(column, 3, 'down')).toBe(0);
    expect(pickNext(column, 0, 'up')).toBe(3);
  });
  it('does not wrap sideways, and nothing that way means no move', () => {
    expect(pickNext(column, 1, 'left')).toBeNull();
    expect(pickNext(column, 1, 'right')).toBeNull();
  });
  it('a two-column grid under a wide button: left/right stay in the row, down finds the one below', () => {
    const grid = [box(0, 0, 220), box(0, 60), box(120, 60), box(0, 120), box(120, 120)];
    expect(pickNext(grid, 1, 'right')).toBe(2);
    expect(pickNext(grid, 2, 'left')).toBe(1);
    expect(pickNext(grid, 2, 'down')).toBe(4);
    expect(pickNext(grid, 2, 'up')).toBe(0);
    expect(pickNext(grid, 4, 'down')).toBe(0);       // wraps to the top
  });
  it('with no current focus it picks the first', () => {
    expect(pickNext(column, -1, 'down')).toBe(0);
    expect(pickNext([], 0, 'down')).toBeNull();
  });
  it('every item is reachable from the first by pressing down', () => {
    const seen = new Set<number>([0]);
    let cur = 0;
    for (let i = 0; i < column.length; i++) { cur = pickNext(column, cur, 'down')!; seen.add(cur); }
    expect(seen.size).toBe(column.length);
  });
});
