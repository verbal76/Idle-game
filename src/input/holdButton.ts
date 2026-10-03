/**
 * Press-and-hold tracking for one on-screen control, shared by the
 * steering pad and the action buttons.
 *
 * Robust against the ways a touch can go missing on a phone: a new
 * finger on the button takes it over (if the previous release never
 * arrived, the button can't stay stuck), pointercancel and
 * lostpointercapture release it, and reset() releases everything (the
 * run calls it on pause, backgrounding and focus loss).
 */
export interface HoldBinding {
  readonly held: boolean;
  /** The pointer currently holding it (null when released). */
  readonly pointerId: number | null;
  release(): void;
  detach(): void;
}

export function bindHold(el: HTMLElement, onChange: (held: boolean) => void): HoldBinding {
  let activeId: number | null = null;
  const set = (id: number | null) => {
    const was = activeId !== null;
    activeId = id;
    const now = activeId !== null;
    el.classList.toggle('pressed', now);
    if (was !== now) onChange(now);
  };
  const onDown = (e: PointerEvent) => {
    try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    set(e.pointerId);
  };
  const onUp = (e: PointerEvent) => { if (e.pointerId === activeId) set(null); };
  const events: Array<[string, (e: PointerEvent) => void]> = [
    ['pointerdown', onDown], ['pointerup', onUp], ['pointercancel', onUp], ['lostpointercapture', onUp],
  ];
  for (const [t, f] of events) el.addEventListener(t, f as EventListener);
  return {
    get held() { return activeId !== null; },
    get pointerId() { return activeId; },
    release: () => set(null),
    detach: () => {
      for (const [t, f] of events) el.removeEventListener(t, f as EventListener);
      set(null);
    },
  };
}
