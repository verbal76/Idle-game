import { ProfileService } from '../profiles/ProfileService';
import { buildBackup, parseBackup, planRestore, type ParsedBackup } from '../profiles/backup';
import { formatCount } from '../game/economy';
import { escapeHtml } from '../util/escapeHtml';
import { safeAsync } from '../util/safeAsync';

const MAILTO_MAX = 7000;   // longer than this may not open in the mail app

/**
 * Back up & restore saves. Backup copies every profile as text; restore
 * takes that text back, checks all of it, shows exactly what would change
 * and only then writes. Resolves on Back.
 */
export function showBackup(root: HTMLElement, profiles: ProfileService): Promise<void> {
  return new Promise<void>((resolve) => {
    let parsed: Extract<ParsedBackup, { ok: true }> | null = null;
    let busy = false;

    root.innerHTML = `
      <div class="fullscreen-panel">
        <h1>Back up &amp; restore</h1>
        <p class="muted">Your profiles live only on this phone. A backup is text you can keep anywhere (Notes, an e-mail to yourself) and paste back later.</p>
        <section class="backup-card">
          <h2>Back up</h2>
          <button id="backup-copy" class="btn-go">Copy backup</button>
          <a id="backup-mail" class="backup-link" hidden>E-mail it to myself</a>
          <p class="muted" id="backup-note"></p>
          <textarea id="backup-text" class="about-fallback" readonly hidden aria-label="Backup text"></textarea>
        </section>
        <section class="backup-card">
          <h2>Restore</h2>
          <textarea id="restore-text" class="backup-paste" placeholder="Paste your backup here" aria-label="Paste a backup"></textarea>
          <button id="restore-check">Check backup</button>
          <p class="form-error" id="restore-error" role="alert" hidden></p>
          <div id="restore-preview" class="backup-preview"></div>
          <button id="restore-apply" class="danger" disabled hidden>Restore</button>
          <p class="muted" id="restore-done" role="status"></p>
        </section>
        <div class="row sticky-actions"><button id="backup-back" class="btn-go" data-back>Back</button></div>
      </div>
    `;
    const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
    const copyBtn = q<HTMLButtonElement>('#backup-copy');
    const mail = q<HTMLAnchorElement>('#backup-mail');
    const note = q('#backup-note');
    const shown = q<HTMLTextAreaElement>('#backup-text');
    const paste = q<HTMLTextAreaElement>('#restore-text');
    const checkBtn = q<HTMLButtonElement>('#restore-check');
    const err = q('#restore-error');
    const preview = q('#restore-preview');
    const apply = q<HTMLButtonElement>('#restore-apply');
    const done = q('#restore-done');

    const makeBackup = async (): Promise<string> => {
      await profiles.save();                  // what is on screen is what is backed up
      return buildBackup(await profiles.list(), profiles.activeProfile?.id ?? null);
    };

    copyBtn.addEventListener('click', safeAsync(async () => {
      if (busy) return;
      busy = true;
      try {
        const text = await makeBackup();
        shown.value = text;
        const count = (JSON.parse(text) as { profiles: unknown[] }).profiles.length;
        try {
          await navigator.clipboard.writeText(text);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy backup'; }, 1500);
          note.textContent = `Copied ${count} profile${count === 1 ? '' : 's'}. Paste it somewhere safe.`;
        } catch {
          // No clipboard in this WebView: select the text so it can be copied by hand.
          shown.hidden = false;
          shown.select();
          note.textContent = `Select all of the text below and copy it (${count} profile${count === 1 ? '' : 's'}).`;
        }
        const compact = JSON.stringify(JSON.parse(text));
        const href = `mailto:?subject=${encodeURIComponent('Where’s the Bottom? backup')}&body=${encodeURIComponent(compact)}`;
        if (href.length <= MAILTO_MAX) { mail.href = href; mail.hidden = false; } else { mail.hidden = true; }
      } finally { busy = false; }
    }));

    const showError = (m: string) => { err.textContent = m; err.hidden = false; };
    const resetCheck = () => { parsed = null; apply.disabled = true; apply.hidden = true; preview.innerHTML = ''; err.hidden = true; done.textContent = ''; };
    paste.addEventListener('input', resetCheck);

    checkBtn.addEventListener('click', safeAsync(async () => {
      if (busy) return;
      resetCheck();
      const result = parseBackup(paste.value);
      if (!result.ok) { showError(result.error); return; }
      parsed = result;
      const rows = planRestore(result.profiles, await profiles.list());
      const behind = rows.some(r => r.olderThanDevice);
      preview.innerHTML = `<ul class="backup-rows">${rows.map((r) => `
        <li><b>${escapeHtml(r.name)}</b>: ${formatCount(r.currency)} snowflakes, ${formatCount(r.runs)} runs
        ${r.existing ? `<span class="muted">(replaces ${escapeHtml(r.existing.name)} on this phone: ${formatCount(r.existing.currency)} snowflakes, ${formatCount(r.existing.runs)} runs)</span>` : '<span class="muted">(new on this phone)</span>'}
        ${r.olderThanDevice ? '<span class="form-error">This phone has more progress than the backup.</span>' : ''}</li>`).join('')}</ul>
        ${result.skipped ? `<p class="muted">${result.skipped} damaged profile${result.skipped === 1 ? ' was' : 's were'} left out.</p>` : ''}
        <p class="muted">Profiles on this phone that are not in the backup are kept.</p>`;
      apply.textContent = behind ? 'Replace anyway' : 'Restore';
      apply.hidden = false;
      apply.disabled = false;
    }));

    apply.addEventListener('click', safeAsync(async () => {
      if (busy || !parsed) return;
      busy = true;
      apply.disabled = true;
      try {
        const r = await profiles.importProfiles(parsed.profiles, parsed.activeId);
        done.textContent = `Restored: ${r.added} added, ${r.replaced} replaced.`;
        preview.innerHTML = '';
        apply.hidden = true;
        parsed = null;
      } catch (e) {
        console.error('[backup] restore failed', e);
        showError('Couldn’t restore everything. Nothing was removed; try again.');
        apply.disabled = false;
      } finally { busy = false; }
    }));

    q<HTMLButtonElement>('#backup-back').addEventListener('click', () => resolve());
  });
}
