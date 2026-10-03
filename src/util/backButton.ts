// Android hardware Back, routed from the native shell (App.tsx) into the
// page. Screens push a handler; the most recent one that returns true
// consumes the press. Unhandled presses ask the native side to exit,
// which is Android's normal Back behaviour on a root screen.

type BackHandler = () => boolean;
const stack: BackHandler[] = [];

export function pushBackHandler(h: BackHandler): () => void {
  stack.push(h);
  return () => {
    const i = stack.lastIndexOf(h);
    if (i >= 0) stack.splice(i, 1);
  };
}

export function handleBack(): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]()) return true;
  }
  return false;
}

/** Drops every handler (the fatal error screen: Back must leave the app). */
export function resetBackHandlers(): void { stack.length = 0; }

const shown = (el: Element) => (el as HTMLElement).getClientRects().length > 0 && !(el as HTMLButtonElement).disabled;

/**
 * The screen-level Back: presses the topmost visible button marked
 * `data-back` (each screen marks its own Back / Cancel / Got it). Every
 * screen gets correct Back behaviour by marking its button; screens
 * without one (main menu, the launch prompt) are roots, where Back
 * leaves the app.
 */
export function clickScreenBack(root: ParentNode = document): boolean {
  const all = [...root.querySelectorAll<HTMLElement>('[data-back]')].filter(shown);
  const top = all[all.length - 1];
  if (!top) return false;
  top.click();
  return true;
}

export function installBackBridge(): void {
  // Lowest priority: run-level handlers pushed later are asked first.
  pushBackHandler(() => clickScreenBack());
  (window as unknown as { __wtbBack?: () => void }).__wtbBack = () => {
    if (!handleBack()) window.ReactNativeWebView?.postMessage('back:exit');
  };
}
