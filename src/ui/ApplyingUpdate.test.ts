import { describe, expect, it } from 'vitest';
import { APPLYING_TEXT, APPLYING_WATCHDOG_MS, ApplyingUpdateState, type Timers } from './ApplyingUpdate';

function rig() {
  const log: boolean[] = [];
  let now = 0;
  const pending = new Map<number, { at: number; fn: () => void }>();
  let id = 0;
  const timers: Timers = {
    set: (fn, ms) => { pending.set(++id, { at: now + ms, fn }); return id; },
    clear: (h) => { pending.delete(h as number); },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [k, t] of [...pending]) if (t.at <= now) { pending.delete(k); t.fn(); }
  };
  const state = new ApplyingUpdateState((v) => log.push(v), timers);
  return { state, log, advance, pending };
}

describe('"Please wait, applying update"', () => {
  it('uses the standard wording', () => {
    expect(APPLYING_TEXT).toBe('Please wait, applying update');
  });

  it('never appears for checking, downloading, waiting or failures', () => {
    const { state, log } = rig();
    for (const s of ['idle', 'checking', 'up-to-date', 'downloading', 'ready', 'deferred', 'offline', 'unavailable', undefined, null, 42]) state.onStatus(s);
    expect(log).toEqual([]);
    expect(state.visible).toBe(false);
  });

  it('appears when activation starts (reloading) and only then', () => {
    const { state, log } = rig();
    state.onStatus('downloading');
    state.onStatus('reloading');
    expect(state.visible).toBe(true);
    expect(log).toEqual([true]);
  });

  it('a repeated report does not stack a second modal or restart the watchdog', () => {
    const { state, log, advance, pending } = rig();
    state.onStatus('reloading');
    advance(10_000);
    state.onStatus('reloading');
    expect(log).toEqual([true]);
    expect(pending.size).toBe(1);
    advance(APPLYING_WATCHDOG_MS - 10_000);      // measured from the FIRST report
    expect(state.visible).toBe(false);
  });

  it('a failed activation (shell reports ready again) removes it at once', () => {
    const { state, log } = rig();
    state.onStatus('reloading');
    state.onStatus('ready');
    expect(state.visible).toBe(false);
    expect(log).toEqual([true, false]);
  });

  it('never stays forever: the watchdog removes it if the shell never answers', () => {
    const { state, log, advance } = rig();
    state.onStatus('reloading');
    advance(APPLYING_WATCHDOG_MS - 1);
    expect(state.visible).toBe(true);            // follows real state, not a short fixed timer
    advance(1);
    expect(state.visible).toBe(false);
    expect(log).toEqual([true, false]);
  });

  it('can show again for a later attempt, and hide() is idempotent', () => {
    const { state, log } = rig();
    state.onStatus('reloading'); state.hide(); state.hide();
    state.onStatus('reloading');
    expect(log).toEqual([true, false, true]);
  });

  it('removing it clears the watchdog (no stray timer)', () => {
    const { state, pending } = rig();
    state.onStatus('reloading');
    state.onStatus('ready');
    expect(pending.size).toBe(0);
  });
});
