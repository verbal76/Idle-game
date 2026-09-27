// Decides when a downloaded OTA may reload the app. Reloading mid-run
// would throw away the run in progress, so while the page reports a run
// is active the reload waits until the run has ended (and been saved).
// Pure logic, shared by App.tsx and its unit tests.

export type ReloadDecision = 'reload-now' | 'defer';

export class UpdateGate {
  private inRun = false;
  private pending = false;

  /** The page reports run:start / run:end. Returns true if a deferred reload should fire now. */
  setInRun(inRun: boolean): boolean {
    this.inRun = inRun;
    if (!inRun && this.pending) {
      this.pending = false;
      return true;
    }
    return false;
  }

  /** A new update finished downloading and wants to apply. */
  onUpdateReady(): ReloadDecision {
    if (this.inRun) {
      this.pending = true;
      return 'defer';
    }
    return 'reload-now';
  }

  get hasDeferredReload(): boolean { return this.pending; }
}
