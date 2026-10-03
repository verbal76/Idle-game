// Decides when a downloaded OTA may reload the app, and keeps update
// checks one at a time. Pure logic, shared by App.tsx and its unit tests.
//
// A reload throws away whatever is on screen, so it only happens when
// the page is on an idle screen (main menu / launch prompt: nothing
// typed, nothing in progress) and no run is active. Otherwise the
// downloaded update waits and applies the moment the page becomes idle
// (or on the next cold start).

export type ReloadDecision = 'reload-now' | 'defer';

export class UpdateGate {
  private inRun = false;
  private idle = false;
  private pending = false;
  private downloaded = false;
  private checking = false;

  private get safe(): boolean { return !this.inRun && this.idle; }

  /** The page reports run:start / run:end. Returns true if a deferred reload should fire now. */
  setInRun(inRun: boolean): boolean {
    this.inRun = inRun;
    return this.firePending();
  }

  /** The page reports ui:idle / ui:busy. Returns true if a deferred reload should fire now. */
  setIdle(idle: boolean): boolean {
    this.idle = idle;
    return this.firePending();
  }

  /** A fresh page (load start, remount): no run, not idle yet. */
  pageReset(): void { this.inRun = false; this.idle = false; }

  /** A new update finished downloading and wants to apply. */
  onUpdateReady(): ReloadDecision {
    this.downloaded = true;
    if (this.safe) return 'reload-now';
    this.pending = true;
    return 'defer';
  }

  /** The player tapped "Restart now": allowed anywhere except mid-run. */
  onApplyRequested(): ReloadDecision {
    if (!this.inRun) return 'reload-now';
    this.pending = true;
    return 'defer';
  }

  /** Starts a check unless one is running or an update is already waiting. */
  beginCheck(): boolean {
    if (this.checking || this.downloaded) return false;
    this.checking = true;
    return true;
  }

  endCheck(): void { this.checking = false; }

  /** The reload didn't happen (it failed): the update is still waiting. */
  reloadFailed(): void { this.pending = true; }

  get hasDeferredReload(): boolean { return this.pending; }
  get hasDownloadedUpdate(): boolean { return this.downloaded; }
  get isInRun(): boolean { return this.inRun; }

  private firePending(): boolean {
    if (this.pending && this.safe) {
      this.pending = false;
      return true;
    }
    return false;
  }
}
