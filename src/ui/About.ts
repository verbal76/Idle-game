import { BUILD_INFO } from '../__generated__/build-info';
import { describeBuild } from '../shell/buildInfo';
import { escapeHtml } from '../util/escapeHtml';
import { buildInfoHtml, wireBuildInfo } from './BuildInfoPanel';

/**
 * About: the player sees the game name and version; the build and update
 * details (commit, update ID, runtime, channel) sit behind one tap for
 * playtesters and bug reports. Both read the same rows
 * (shell/buildInfo.ts), so they can never disagree.
 */
export function showAbout(root: HTMLElement): Promise<void> {
  return new Promise<void>((resolve) => {
    let unwire: () => void = () => {};
    const finish = () => { unwire(); window.removeEventListener('ota-info', render); resolve(); };
    function render() {
      unwire();
      const rows = describeBuild(window.__OTA__, BUILD_INFO);
      const val = (id: string) => rows.find(r => r.id === id)?.full;
      const ver = val('app-version');
      const code = val('native-build');
      const version = ver && ver !== 'Unavailable'
        ? `Version ${escapeHtml(ver)}${code && code !== 'Unavailable' ? ` (${escapeHtml(code)})` : ''}`
        : '';
      const open = root.querySelector<HTMLDetailsElement>('details.build-details')?.open ?? false;
      root.innerHTML = `
        <div class="fullscreen-panel">
          <h1>About</h1>
          <div class="about-card">
            <div class="about-title">Where's the Bottom?</div>
            ${version ? `<div class="about-version">${version}</div>` : ''}
            <p class="muted">A snowboarding game made by Hot Attic Games.</p>
          </div>
          <details class="build-details"${open ? ' open' : ''}>
            <summary>Build &amp; update details</summary>
            ${buildInfoHtml()}
          </details>
          <div class="row sticky-actions"><button id="about-back" class="btn-go" data-back>Back</button></div>
        </div>
      `;
      unwire = wireBuildInfo(root);
      root.querySelector<HTMLButtonElement>('#about-back')!.addEventListener('click', finish);
    }
    // Late native metadata: repaint with the real values.
    window.addEventListener('ota-info', render);
    render();
  });
}
