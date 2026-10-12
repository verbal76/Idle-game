import { describe, expect, it } from 'vitest';
import { createGameInput } from './mux';
import { InputHub } from './hub';
import { KeyboardSource } from './keyboard';
import { PAD } from './actions';
import type { PadSnapshot } from './gamepad';

const touch = () => ({ steer: { left: { x: 0, y: 0 }, upHeld: false }, buttons: { jumpHeld: false, flipHeld: false } });
const pad = (down: number[] = [], axes = [0, 0, 0, 0]): PadSnapshot => {
  const buttons = Array.from({ length: 17 }, () => false);
  for (const i of down) buttons[i] = true;
  return { id: 'Xbox 045e', axes, buttons };
};

describe('touch is preserved', () => {
  it('with no other source active, leftStick() is the strip’s own object and buttons are the buttons', () => {
    const t = touch();
    const hub = new InputHub({ getPads: () => [] });
    const kb = new KeyboardSource(new EventTarget());
    const gi = createGameInput(t, hub, kb);
    expect(gi.leftStick()).toBe(t.steer.left);
    t.steer.left.x = -0.4; t.steer.upHeld = true; t.buttons.jumpHeld = true; t.buttons.flipHeld = true;
    expect(gi.leftStick()).toBe(t.steer.left);
    expect(gi.leftStick().x).toBe(-0.4);
    expect([gi.jumpHeld(), gi.flipHeld(), gi.forwardHeld!()]).toEqual([true, true, true]);
  });
  it('works with the controller system absent altogether', () => {
    const t = touch();
    const gi = createGameInput(t, null, null);
    t.buttons.jumpHeld = true;
    expect(gi.jumpHeld()).toBe(true);
    expect(gi.leftStick()).toBe(t.steer.left);
  });
});

describe('sources combine', () => {
  it('the pad steers and presses when touch is idle', () => {
    let p = pad();
    const hub = new InputHub({ getPads: () => [p] });
    hub.poll();
    const gi = createGameInput(touch(), hub, null);
    p = pad([PAD.south, PAD.west, PAD.lb], [-1, 0, 0, 0]); hub.poll();
    expect(gi.leftStick().x).toBe(-1);
    expect([gi.jumpHeld(), gi.flipHeld(), gi.forwardHeld!()]).toEqual([true, true, true]);
    p = pad(); hub.poll();
    expect([gi.leftStick().x, gi.jumpHeld(), gi.flipHeld(), gi.forwardHeld!()]).toEqual([0, false, false, false]);
  });
  it('a thumb on the strip wins steering over the pad, buttons OR together', () => {
    let p = pad([PAD.south], [1, 0, 0, 0]);
    const hub = new InputHub({ getPads: () => [p] });
    hub.poll(); p = pad([PAD.south], [1, 0, 0, 0]); hub.poll();
    const t = touch();
    const gi = createGameInput(t, hub, null);
    t.steer.left.x = -0.5;
    expect(gi.leftStick().x).toBe(-0.5);
    t.steer.left.x = 0;
    expect(gi.leftStick().x).toBe(1);
  });
  it('releaseAll clears a held pad button and a held key until they are released', () => {
    const target = new EventTarget();
    const kb = new KeyboardSource(target);
    let p = pad();
    const hub = new InputHub({ getPads: () => [p] });
    hub.poll();
    const gi = createGameInput(touch(), hub, kb);
    p = pad([PAD.south]); hub.poll();
    target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyF', repeat: false }));
    expect([gi.jumpHeld(), gi.flipHeld()]).toEqual([true, true]);
    gi.releaseAll();
    expect([gi.jumpHeld(), gi.flipHeld()]).toEqual([false, false]);
  });
});
