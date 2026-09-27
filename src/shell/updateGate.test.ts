import { describe, expect, it } from 'vitest';
import { UpdateGate } from './updateGate';

describe('OTA reload gate (#1)', () => {
  it('reloads immediately on a menu', () => {
    const g = new UpdateGate();
    expect(g.onUpdateReady()).toBe('reload-now');
  });

  it('never reloads during a run; applies the update once the run ends', () => {
    const g = new UpdateGate();
    g.setInRun(true);
    expect(g.onUpdateReady()).toBe('defer');
    expect(g.onUpdateReady()).toBe('defer');        // later polls during the same run
    expect(g.hasDeferredReload).toBe(true);
    expect(g.setInRun(false)).toBe(true);            // back on the menus: reload now, once
    expect(g.setInRun(false)).toBe(false);
    expect(g.hasDeferredReload).toBe(false);
  });

  it('a run ending with nothing downloaded does not reload', () => {
    const g = new UpdateGate();
    g.setInRun(true);
    expect(g.setInRun(false)).toBe(false);
  });
});
