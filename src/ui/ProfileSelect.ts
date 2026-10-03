import { MusicPlayer } from '../audio/MusicPlayer';
import { ProfileService } from '../profiles/ProfileService';
import type { SaveData } from '../profiles/IndexedDbStore';
import { NAME_MAX } from '../profiles/migrate';
import { showSettings } from './Settings';
import { showNameSelect } from './NameSelect';
import { bouncyTextHtml } from '../util/bouncyText';
import { escapeHtml } from '../util/escapeHtml';
import { showStats } from './Stats';
import { ICON_EDIT, ICON_STATS } from './icons';

/**
 * The profile picker. Resolves once a profile is active (picked or
 * created), or, when switching from the main menu, on Back with the
 * current profile unchanged. Each row also opens Stats and a Manage
 * sheet (rename / delete).
 */
export async function showProfileSelect(
  root: HTMLElement,
  profiles: ProfileService,
  music: MusicPlayer,
): Promise<void> {
  let list = await profiles.list();
  return new Promise<void>((resolve) => {
    // One action at a time: a double tap can't start two of them.
    let busy = false;
    const guard = (fn: () => Promise<void>) => async () => {
      if (busy) return;
      busy = true;
      try { await fn(); } finally { busy = false; }
    };
    let error = '';

    const render = () => {
      const canGoBack = !!profiles.activeProfile;
      root.innerHTML = `
        <div class="fullscreen-panel menu-bg menu-bg-stacked splash-bg">
          <button class="gear-btn corner" id="ps-settings" aria-label="Settings"><span class="settings-gear" aria-hidden="true"></span></button>
          <h1 class="title-bouncy">${bouncyTextHtml("Where's the Bottom?")}</h1>
          <p class="muted">${list.length ? 'Who\'s riding?' : 'Create your boarder to start'}</p>
          ${error ? `<p class="form-error" role="alert">${escapeHtml(error)}</p>` : ''}
          <div class="list" id="profile-list"></div>
          <div class="row">
            <button id="new-profile" class="${list.length ? '' : 'btn-go'}">New profile</button>
            ${canGoBack ? '<button id="ps-back" class="btn-ghost" data-back>Back</button>' : ''}
          </div>
        </div>
      `;

      const listEl = root.querySelector<HTMLElement>('#profile-list')!;
      for (const p of list) {
        const line = document.createElement('div');
        line.className = 'profile-line';
        const btn = document.createElement('button');
        btn.textContent = p.name;
        if (p.id === profiles.activeProfile?.id) btn.classList.add('btn-go');
        const statsBtn = document.createElement('button');
        statsBtn.className = 'profile-stats-btn';
        statsBtn.innerHTML = ICON_STATS;
        statsBtn.setAttribute('aria-label', `Stats for ${p.name}`);
        const editBtn = document.createElement('button');
        editBtn.className = 'profile-stats-btn profile-edit-btn';
        editBtn.innerHTML = ICON_EDIT;
        editBtn.setAttribute('aria-label', `Rename or delete ${p.name}`);
        statsBtn.addEventListener('click', guard(async () => { await showStats(root, p); render(); }));
        editBtn.addEventListener('click', guard(async () => {
          await showManage(root, profiles, p);
          list = await profiles.list();
          render();
        }));
        btn.addEventListener('click', guard(async () => {
          try {
            await profiles.setActive(p.id);
            resolve();
          } catch (e) {
            console.error('[profiles] select failed', e);
            error = 'Couldn\'t load that profile. Please try again.';
            list = await profiles.list().catch(() => list);
            render();
          }
        }));
        line.append(btn, statsBtn, editBtn);
        listEl.appendChild(line);
      }

      root.querySelector<HTMLButtonElement>('#new-profile')!.addEventListener('click', guard(async () => {
        const name = await showNameSelect(root);
        if (!name) { render(); return; }
        try {
          const created = await profiles.create(name);
          await profiles.setActive(created.id);
          resolve();
        } catch (e) {
          console.error('[profiles] create failed', e);
          error = 'Couldn\'t create the profile. Please try again.';
          render();
        }
      }));
      root.querySelector<HTMLButtonElement>('#ps-back')?.addEventListener('click', () => { if (!busy) resolve(); });
      root.querySelector<HTMLButtonElement>('#ps-settings')!.addEventListener('click', guard(async () => {
        await showSettings(root, music, profiles);
        render();
      }));
    };

    render();
  });
}

/** Rename or delete one profile (delete asks first). */
function showManage(root: HTMLElement, profiles: ProfileService, p: SaveData): Promise<void> {
  return new Promise<void>((resolve) => {
    const render = (confirming: boolean, note = '') => {
      root.innerHTML = confirming ? `
        <div class="fullscreen-panel menu-bg splash-bg">
          <h1>Delete profile?</h1>
          <p class="confirm-copy"><b>${escapeHtml(p.name)}</b> and all of their snowflakes, upgrades and records will be gone for good.</p>
          <div class="list">
            <button id="manage-delete-yes" class="danger">Delete ${escapeHtml(p.name)}</button>
            <button id="manage-delete-no" class="btn-go" data-back>Keep</button>
          </div>
        </div>` : `
        <div class="fullscreen-panel menu-bg splash-bg">
          <h1>Profile</h1>
          <label class="field-label" for="manage-name">Name</label>
          <input id="manage-name" class="name-input" maxlength="${NAME_MAX * 2}" value="${escapeHtml(p.name)}" autocomplete="off" />
          ${note ? `<p class="form-error" role="alert">${escapeHtml(note)}</p>` : ''}
          <div class="list">
            <button id="manage-rename" class="btn-go">Save name</button>
            <button id="manage-delete" class="danger">Delete profile</button>
            <button id="manage-back" class="btn-ghost" data-back>Back</button>
          </div>
        </div>`;
      if (confirming) {
        root.querySelector('#manage-delete-yes')!.addEventListener('click', async () => {
          try { await profiles.deleteProfile(p.id); } catch (e) { console.error('[profiles] delete failed', e); }
          resolve();
        }, { once: true });
        root.querySelector('#manage-delete-no')!.addEventListener('click', () => render(false), { once: true });
        return;
      }
      const input = root.querySelector<HTMLInputElement>('#manage-name')!;
      const save = async () => {
        if (!input.value.trim()) { render(false, 'Enter a name.'); return; }
        const done = await profiles.rename(p.id, input.value).catch(() => null);
        if (!done) { render(false, 'Couldn\'t save the name. Please try again.'); return; }
        resolve();
      };
      root.querySelector('#manage-rename')!.addEventListener('click', () => { void save(); }, { once: true });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') void save(); });
      root.querySelector('#manage-delete')!.addEventListener('click', () => render(true), { once: true });
      root.querySelector('#manage-back')!.addEventListener('click', () => resolve(), { once: true });
    };
    render(false);
  });
}
