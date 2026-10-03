import { escapeHtml } from '../util/escapeHtml';
import { resetBackHandlers } from '../util/backButton';
import { openBugReport } from '../util/bugReport';

/**
 * The one screen for a failure the game can't continue from (it could
 * not start). A player sees a plain message, Restart and Send report;
 * the technical detail sits behind "Details". Back leaves the app, the
 * native shell is told to unlock orientation, end any run (so a fixing
 * update can install) and the music stops.
 */
export function showFatalError(where: string, err: unknown): void {
  const detail = (err && (err as { stack?: string }).stack) || String(err);
  console.error(`[fatal:${where}]`, err);
  resetBackHandlers();
  const post = (m: string) => { try { window.ReactNativeWebView?.postMessage(m); } catch { /* no shell */ } };
  post('orientation:default');
  post('run:end');
  try { window.dispatchEvent(new Event('music-pause-before-reload')); } catch { /* ignore */ }
  document.body.innerHTML = `
    <div id="screen" style="position:fixed;inset:0;z-index:2">
      <div class="fullscreen-panel fatal-panel" role="alertdialog" aria-labelledby="fatal-title">
        <h1 id="fatal-title">Wipeout!</h1>
        <p class="fatal-copy">Something went wrong and the game couldn't start. Your progress is saved.</p>
        <div class="list">
          <button id="fatal-restart" class="btn-go">Restart</button>
          <button id="fatal-report" class="btn-ghost">Send bug report</button>
        </div>
        <details class="fatal-details"><summary>Details</summary><pre>[${escapeHtml(where)}]\n${escapeHtml(String(detail))}</pre></details>
      </div>
    </div>`;
  document.getElementById('fatal-restart')!.addEventListener('click', () => {
    // The native shell remounts the page; in a plain browser, reload.
    if (window.ReactNativeWebView) post('app:reload'); else location.reload();
  });
  document.getElementById('fatal-report')!.addEventListener('click', () => { void openBugReport(); });
}
