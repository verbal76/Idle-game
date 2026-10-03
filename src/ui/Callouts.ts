import type { Callout } from '../game/callout';

const MAX_SHOWN = 3;
const LIFE_MS = 1400;

/**
 * Stacked, self-removing trick callouts in the upper middle of the HUD.
 * Newest on top; at most three at once.
 */
export function createCallouts(hud: HTMLElement): (c: Callout) => void {
  const stack = document.createElement('div');
  stack.className = 'callout-stack';
  stack.id = 'callouts';
  hud.appendChild(stack);
  return (c) => {
    const el = document.createElement('div');
    el.className = `callout callout-${c.tone}`;
    const title = document.createElement('div');
    title.className = 'callout-title';
    title.textContent = c.title;
    el.appendChild(title);
    if (c.sub) {
      const sub = document.createElement('div');
      sub.className = 'callout-sub';
      sub.textContent = c.sub;
      el.appendChild(sub);
    }
    stack.prepend(el);
    while (stack.children.length > MAX_SHOWN) stack.lastElementChild!.remove();
    setTimeout(() => el.remove(), LIFE_MS);
  };
}
