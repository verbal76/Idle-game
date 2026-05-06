import { BUILD_INFO } from '../__generated__/build-info';

interface OtaInfo {
  updateId: string | null;
  runtimeVersion: string | null;
  channel: string | null;
  createdAt: string | null;
  isEmbeddedLaunch: boolean | null;
}

declare global {
  interface Window { __OTA__?: OtaInfo }
}

const NA = 'n/a';

function readOta(): OtaInfo {
  return window.__OTA__ ?? {
    updateId: null, runtimeVersion: null, channel: null,
    createdAt: null, isEmbeddedLaunch: null,
  };
}

// True when the OTA is older than the embedded bundle. Indicates a
// dropped/skipped OTA that the launcher silently fell back from — easy
// to misread otherwise.
function otaIsStale(ota: OtaInfo): boolean {
  if (!ota.createdAt) return false;
  const otaT = Date.parse(ota.createdAt);
  const buildT = Date.parse(BUILD_INFO.builtAt);
  return Number.isFinite(otaT) && Number.isFinite(buildT) && otaT < buildT;
}

function row(label: string, value: string, mono = false): string {
  const cls = mono ? 'about-val mono' : 'about-val';
  return `<div class="about-row"><span class="about-label">${label}</span><span class="${cls}">${escapeHtml(value)}</span></div>`;
}

function fmtBool(v: boolean | null, yes = 'yes', no = 'no'): string {
  return v === null ? NA : v ? yes : no;
}

function buildText(ota: OtaInfo): string {
  // Plain-text dump for the Copy button. Same field set as the visual
  // panel; pasted into a bug report this is enough to identify the
  // exact build a user is on.
  return [
    `branch:        ${BUILD_INFO.branch}${BUILD_INFO.dirty ? ' (dirty)' : ''}`,
    `commit:        ${BUILD_INFO.commit}`,
    `built:         ${BUILD_INFO.builtAt}`,
    `app:           ${BUILD_INFO.appVersion} (versionCode ${BUILD_INFO.androidVersionCode ?? NA})`,
    `runtime:       ${ota.runtimeVersion ?? NA}`,
    `channel:       ${ota.channel ?? NA}`,
    `ota updateId:  ${ota.updateId ?? NA}`,
    `ota createdAt: ${ota.createdAt ?? NA}`,
    `embedded:      ${fmtBool(ota.isEmbeddedLaunch)}`,
    otaIsStale(ota) ? `WARNING:       OTA older than embedded bundle (stale update)` : null,
  ].filter(Boolean).join('\n');
}

export function showAbout(root: HTMLElement): Promise<void> {
  return new Promise<void>((resolve) => {
    const finish = () => {
      window.removeEventListener('ota-info', onOtaInfo);
      resolve();
    };
    const onOtaInfo = () => render();
    const render = () => {
      const ota = readOta();
      const stale = otaIsStale(ota);
      root.innerHTML = `
        <div class="fullscreen-panel">
          <h1>About</h1>
          <p class="muted">Build identification</p>
          <div class="about-list">
            ${row('Branch', BUILD_INFO.branch + (BUILD_INFO.dirty ? ' ⚠ dirty' : ''))}
            ${row('Commit', BUILD_INFO.commitShort, true)}
            ${row('Full SHA', BUILD_INFO.commit, true)}
            ${row('Built', BUILD_INFO.builtAt, true)}
            ${row('App version', BUILD_INFO.appVersion)}
            ${row('Android versionCode', String(BUILD_INFO.androidVersionCode ?? NA))}
            ${row('Runtime', ota.runtimeVersion ?? NA)}
            ${row('Channel', ota.channel ?? NA)}
            ${row('OTA updateId', ota.updateId ?? NA, true)}
            ${row('OTA createdAt', ota.createdAt ?? NA, true)}
            ${row('Source', fmtBool(ota.isEmbeddedLaunch, 'embedded (APK)', 'OTA download'))}
          </div>
          ${stale ? `<p class="about-warn">⚠ OTA is older than the embedded bundle — launcher fell back to embedded.</p>` : ''}
          <div class="row">
            <button id="about-copy">Copy</button>
            <button id="about-back">Back</button>
          </div>
        </div>
      `;
      const copyBtn = root.querySelector<HTMLButtonElement>('#about-copy')!;
      copyBtn.addEventListener('click', async () => {
        const text = buildText(ota);
        try {
          await navigator.clipboard.writeText(text);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
        } catch {
          // Clipboard API unavailable in WebView — fall back to a
          // selectable textarea rendered inline so the user can long-
          // press to copy manually.
          const ta = document.createElement('textarea');
          ta.className = 'about-fallback';
          ta.readOnly = true;
          ta.value = text;
          root.querySelector('.about-list')!.appendChild(ta);
          ta.select();
        }
      });
      root.querySelector<HTMLButtonElement>('#about-back')!.addEventListener('click', finish);
    };

    // Late OTA arrival (post-load injection): re-render so the panel
    // shows real values instead of n/a if it was opened before native
    // had a chance to inject window.__OTA__.
    window.addEventListener('ota-info', onOtaInfo);
    render();
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
  )[ch]!);
}
