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

export function installBackBridge(): void {
  (window as unknown as { __wtbBack?: () => void }).__wtbBack = () => {
    if (!handleBack()) window.ReactNativeWebView?.postMessage('back:exit');
  };
}
