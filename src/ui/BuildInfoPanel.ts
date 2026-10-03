import { BUILD_INFO } from '../__generated__/build-info';
import { buildInfoText, describeBuild, type RawShellInfo } from '../shell/buildInfo';
import { escapeHtml } from '../util/escapeHtml';
import { safeAsync } from '../util/safeAsync';

declare global {
  // Injected by the native shell (App.tsx) before and after page load.
  interface Window { __OTA__?: RawShellInfo }
}

const rows = () => describeBuild(window.__OTA__, BUILD_INFO);

/** The Build / Update Info block at the bottom of Settings. */
export function buildInfoHtml(): string {
  const body = rows().map(r => `
    <div class="bi-row" data-id="${r.id}">
      <span class="bi-label">${escapeHtml(r.label)}</span>
      <span class="bi-val" data-short="${escapeHtml(r.value)}" data-full="${escapeHtml(r.full)}">${escapeHtml(r.value)}</span>
    </div>`).join('');
  return `
    <section class="build-info" id="build-info" aria-label="Build and update info">
      <h2>Build / Update Info</h2>
      <div class="bi-list">${body}</div>
      <div class="bi-actions">
        <button id="bi-full" class="toggle" aria-pressed="false">Show full IDs</button>
        <button id="bi-copy" class="toggle">Copy</button>
      </div>
    </section>`;
}

/** Wires the buttons; re-renders when the shell's metadata arrives late. Returns a cleanup. */
export function wireBuildInfo(root: HTMLElement): () => void {
  const section = () => root.querySelector<HTMLElement>('#build-info');
  const wire = () => {
    const s = section();
    if (!s) return;
    const fullBtn = s.querySelector<HTMLButtonElement>('#bi-full')!;
    fullBtn.addEventListener('click', () => {
      const on = fullBtn.getAttribute('aria-pressed') !== 'true';
      fullBtn.setAttribute('aria-pressed', String(on));
      fullBtn.textContent = on ? 'Short IDs' : 'Show full IDs';
      for (const v of s.querySelectorAll<HTMLElement>('.bi-val')) v.textContent = (on ? v.dataset.full : v.dataset.short) ?? '';
      s.classList.toggle('full', on);
    });
    const copyBtn = s.querySelector<HTMLButtonElement>('#bi-copy')!;
    copyBtn.addEventListener('click', safeAsync(async () => {
      const text = buildInfoText(rows());
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
      } catch {
        // No clipboard in this WebView: show a selectable copy instead.
        if (s.querySelector('textarea')) return;
        const ta = document.createElement('textarea');
        ta.className = 'about-fallback';
        ta.readOnly = true;
        ta.value = text;
        s.appendChild(ta);
        ta.select();
      }
    }));
  };
  const onInfo = () => {
    const s = section();
    if (!s) return;
    s.outerHTML = buildInfoHtml();
    wire();
  };
  wire();
  window.addEventListener('ota-info', onInfo);
  return () => window.removeEventListener('ota-info', onInfo);
}
