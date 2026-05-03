import { ProfileService } from '../profiles/ProfileService';

export async function showProfileSelect(root: HTMLElement, profiles: ProfileService): Promise<void> {
  const list = await profiles.list();
  return new Promise<void>((resolve) => {
    root.innerHTML = `
      <div class="fullscreen-panel">
        <h1>BOARDER</h1>
        <p class="muted">Pick a profile</p>
        <div class="list" id="profile-list"></div>
        <div class="row">
          <button id="new-profile">New profile</button>
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
          await profiles.setActive(p.id);
          resolve();
        });
        listEl.appendChild(btn);
      }
    }

    root.querySelector<HTMLButtonElement>('#new-profile')!.addEventListener('click', async () => {
      const name = prompt('Profile name?', 'Rider')?.trim();
      if (!name) return;
      const created = await profiles.create(name);
      await profiles.setActive(created.id);
      resolve();
    });
  });
}
