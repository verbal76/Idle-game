import { MusicPlayer } from '../audio/MusicPlayer';
import { ProfileService } from '../profiles/ProfileService';
import { showSettings } from './Settings';

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
        <div class="fullscreen-panel menu-bg">
          <button class="gear-btn corner" id="ps-settings" aria-label="Settings">⚙</button>
          <h1>Idle Boarder</h1>
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
          const btn = document.createElement('button');
          btn.textContent = p.name;
          btn.addEventListener('click', async () => {
            if (picked) return;
            picked = true;
            await profiles.setActive(p.id);
            resolve();
          });
          listEl.appendChild(btn);
        }
      }

      root.querySelector<HTMLButtonElement>('#new-profile')!.addEventListener('click', async () => {
        if (picked) return;
        const name = prompt('Profile name?', 'Rider')?.trim();
        if (!name) return;
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
