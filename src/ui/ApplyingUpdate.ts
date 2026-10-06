import { pushBackHandler } from '../util/backButton';

/**
 * "Please wait, applying update": shown only while a verified update is
 * actually being activated (the native shell reports status 'reloading'
 * just before it swaps the bundle), never for checking, downloading or
 * waiting. It follows the real updater state, so there is no fixed timer:
 * any other status (a failed reload reports 'ready' again) removes it, and
 * a watchdog removes it if the shell never answers. A successful update
 * replaces the whole page, which removes it naturally.
 */
export const APPLYING_TEXT = 'Please wait, applying update';
export const APPLYING_WATCHDOG_MS = 30_000;

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}
const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/** The state machine behind the modal (pure: no DOM). */
export class ApplyingUpdateState {
  private shown = false;
  private watchdog: unknown = null;

  constructor(
    private readonly onChange: (visible: boolean) => void,
    private readonly timers: Timers = realTimers,
    private readonly watchdogMs: number = APPLYING_WATCHDOG_MS,
  ) {}

  get visible(): boolean { return this.shown; }

  /** The shell's update status. Only 'reloading' (activation underway) shows the modal. */
  onStatus(status: unknown): void {
    if (status === 'reloading') this.show();
    else this.hide();
  }

  private show(): void {
    if (this.shown) return;          // a repeat report never stacks a second modal or restarts the watchdog
    this.shown = true;
    this.watchdog = this.timers.set(() => this.hide(), this.watchdogMs);
    this.onChange(true);
  }

  hide(): void {
    if (this.watchdog !== null) { this.timers.clear(this.watchdog); this.watchdog = null; }
    if (!this.shown) return;
    this.shown = false;
    this.onChange(false);
  }
}

/** Wires the modal to the shell's `update-status` events. Returns a cleanup. */
export function mountApplyingUpdate(doc: Document = document): () => void {
  let el: HTMLElement | null = null;
  let popBack: (() => void) | null = null;
  const state = new ApplyingUpdateState((visible) => {
    if (visible) {
      el = doc.createElement('div');
      el.id = 'applying-update';
      el.className = 'applying-update';
      el.setAttribute('role', 'alertdialog');
      el.setAttribute('aria-live', 'assertive');
      el.setAttribute('aria-busy', 'true');
      el.setAttribute('aria-label', APPLYING_TEXT);
      el.innerHTML = `<div class="applying-card"><div class="applying-spinner" aria-hidden="true"></div><div class="applying-text">${APPLYING_TEXT}</div></div>`;
      // Swallow every touch: nothing underneath may change while the bundle is swapped.
      for (const t of ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchmove']) {
        el.addEventListener(t, (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
      }
      doc.body.appendChild(el);
      popBack = pushBackHandler(() => true);   // Android Back does nothing meanwhile
    } else {
      el?.remove();
      el = null;
      popBack?.();
      popBack = null;
    }
  });
  const onStatus = (e: Event) => state.onStatus((e as CustomEvent).detail);
  window.addEventListener('update-status', onStatus);
  return () => { window.removeEventListener('update-status', onStatus); state.hide(); };
}
