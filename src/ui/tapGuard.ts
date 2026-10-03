/**
 * Tap-through guard for the whole UI. Screens swap their content the
 * instant a button is pressed, so the second tap of a quick double tap
 * lands on whatever the next screen put in the same place (an upgrade
 * bought by accident, a summary skipped). For a moment after a panel
 * appears (a fresh screen, or an overlay switched on), taps on panel
 * buttons are swallowed.
 */
export const TAP_GUARD_MS = 200;
let lockedUntil = 0;

export function lockTaps(ms = TAP_GUARD_MS): void {
  lockedUntil = Math.max(lockedUntil, performance.now() + ms);
}

export function tapsLocked(): boolean { return performance.now() < lockedUntil; }

export function installTapGuard(doc: Document = document): void {
  // Lets the smoke test wait out the guard instead of guessing.
  (window as unknown as { __tapsLocked?: () => boolean }).__tapsLocked = tapsLocked;
  // A panel was inserted (a new screen) or switched on (an overlay).
  const isPanel = (n: Node) => n instanceof HTMLElement && (n.classList.contains('fullscreen-panel') || !!n.querySelector('.fullscreen-panel'));
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList' ? [...r.addedNodes].some(isPanel)
        : (r.target as HTMLElement).classList.contains('fullscreen-panel') && (r.target as HTMLElement).style.display !== 'none') {
        lockTaps();
        return;
      }
    }
  }).observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  const swallow = (e: Event) => {
    if (!tapsLocked()) return;
    const t = e.target as Element | null;
    if (t?.closest?.('.fullscreen-panel button, .fullscreen-panel input')) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  for (const type of ['pointerdown', 'pointerup', 'click']) doc.addEventListener(type, swallow, true);
}
