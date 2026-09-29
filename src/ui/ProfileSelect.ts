import { MusicPlayer } from '../audio/MusicPlayer';
import { ProfileService } from '../profiles/ProfileService';
import { showSettings } from './Settings';
import { showNameSelect } from './NameSelect';
import { bouncyTextHtml } from '../util/bouncyText';
import { showStats } from './Stats';

export async function showProfileSelect(
  root: HTMLElement,
  profiles: ProfileService,
  music: MusicPlayer,
): Promise<void> {
  const list = await profiles.list();
  return new Promise<void>((resolve) => {
    // Guard against double-resolve from a fast double-tap on a profile
    // button — without this, both clicks await profiles.setActive in
    // parallel and resolve() runs twice (the second call is a no-op on
    // a settled Promise but the duplicated IDB write is wasteful).
    let picked = false;
    const render = () => {
      root.innerHTML = `
        <div class="fullscreen-panel menu-bg menu-bg-stacked">
          <button class="gear-btn corner" id="ps-settings" aria-label="Settings"><span class="settings-gear" aria-hidden="true"></span></button>
          <h1 class="title-bouncy">${bouncyTextHtml("Where's the Bottom?")}</h1>
          <p class="muted">Pick a profile</p>
          <div class="list" id="profile-list"></div>
          <div class="row">
            <button id="new-profile">New profile</button>
            <button id="ps-settings-row">Settings</button>
          </div>
        </div>
      `;

      const listEl = root.querySelector<HTMLElement>('#profile-list')!;
      if (list.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'No profiles yet';
        listEl.appendChild(empty);
      } else {
        for (const p of list) {
          const line = document.createElement('div');
          line.className = 'profile-line';
          const btn = document.createElement('button');
          btn.textContent = p.name;
          const statsBtn = document.createElement('button');
          statsBtn.className = 'profile-stats-btn';
          statsBtn.textContent = '📊';
          statsBtn.setAttribute('aria-label', `Stats for ${p.name}`);
          statsBtn.addEventListener('click', async () => {
            if (picked) return;
            await showStats(root, p);
            render();
          });
          line.append(btn, statsBtn);
          btn.addEventListener('click', async () => {
            if (picked) return;
            picked = true;
            await profiles.setActive(p.id);
            resolve();
          });
          listEl.appendChild(line);
        }
      }

      root.querySelector<HTMLButtonElement>('#new-profile')!.addEventListener('click', async () => {
        if (picked) return;
        // Custom name picker — random whimsical adjective+noun pair
        // by default with a Reroll button, plus a Type toggle for
        // entering a custom name. Replaces the bland prompt('...',
        // 'Rider') the page used to use.
        const name = await showNameSelect(root);
        if (!name) {
          render(); // user cancelled — restore the profile picker
          return;
        }
        picked = true;
        const created = await profiles.create(name);
        await profiles.setActive(created.id);
        resolve();
      });

      const openSettings = async () => {
        await showSettings(root, music, profiles);
        render();
      };
      root.querySelector<HTMLButtonElement>('#ps-settings')!.addEventListener('click', openSettings);
      root.querySelector<HTMLButtonElement>('#ps-settings-row')!.addEventListener('click', openSettings);
    };

    render();
  });
}
