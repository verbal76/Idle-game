import { describe, expect, it } from 'vitest';
import { UpdateGate } from './updateGate';

const onMenu = () => { const g = new UpdateGate(); g.setIdle(true); return g; };

describe('OTA reload gate (#1)', () => {
  it('reloads immediately on an idle menu', () => {
    expect(onMenu().onUpdateReady()).toBe('reload-now');
  });

  it('never reloads during a run; applies the update once the run ends', () => {
    const g = onMenu();
    g.setInRun(true);
    expect(g.onUpdateReady()).toBe('defer');
    expect(g.onUpdateReady()).toBe('defer');        // later polls during the same run
    expect(g.hasDeferredReload).toBe(true);
    expect(g.setInRun(false)).toBe(true);            // back on the menus: reload now, once
    expect(g.setInRun(false)).toBe(false);
    expect(g.hasDeferredReload).toBe(false);
  });

  it('a run ending with nothing downloaded does not reload', () => {
    const g = onMenu();
    g.setInRun(true);
    expect(g.setInRun(false)).toBe(false);
  });
});

describe('update gate: screens, manual restart, checks (pre-release review)', () => {
  it('does not reload on a busy screen (name entry, Upgrades); waits for the main menu', () => {
    const g = new UpdateGate();
    g.setIdle(false);
    expect(g.onUpdateReady()).toBe('defer');
    expect(g.setIdle(true)).toBe(true);
  });

  it('a run ending onto a busy screen (post-run Upgrades) still waits', () => {
    const g = onMenu();
    g.setInRun(true);
    g.onUpdateReady();
    g.setIdle(false);
    expect(g.setInRun(false)).toBe(false);
    expect(g.setIdle(true)).toBe(true);
  });

  it('"Restart now" works from Settings but never mid-run', () => {
    const g = new UpdateGate();
    expect(g.onApplyRequested()).toBe('reload-now');
    g.setInRun(true);
    expect(g.onApplyRequested()).toBe('defer');
    g.setIdle(true);
    expect(g.setInRun(false)).toBe(true);
  });

  it('one check at a time, and none once an update is waiting', () => {
    const g = new UpdateGate();
    expect(g.beginCheck()).toBe(true);
    expect(g.beginCheck()).toBe(false);
    g.endCheck();
    expect(g.beginCheck()).toBe(true);
    g.onUpdateReady();
    g.endCheck();
    expect(g.beginCheck()).toBe(false);
  });

  it('a fresh page is never mid-run (a crashed WebView cannot leave updates stuck)', () => {
    const g = onMenu();
    g.setInRun(true);
    g.onUpdateReady();
    g.pageReset();
    expect(g.isInRun).toBe(false);
    expect(g.setIdle(true)).toBe(true);
  });

  it('a failed reload keeps the update waiting', () => {
    const g = onMenu();
    expect(g.onUpdateReady()).toBe('reload-now');
    g.reloadFailed();
    expect(g.setIdle(true)).toBe(true);
  });
});
