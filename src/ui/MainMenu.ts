import { ProfileService } from '../profiles/ProfileService';

export type MenuChoice = 'half-pipe' | 'downhill' | 'switch-profile' | 'upgrades' | 'settings';

export function showMainMenu(root: HTMLElement, profiles: ProfileService): Promise<MenuChoice> {
  return new Promise<MenuChoice>((resolve) => {
    const p = profiles.activeProfile!;
    root.innerHTML = `
      <div class="fullscreen-panel">
        <button class="gear-btn corner" id="menu-settings" aria-label="Settings">⚙</button>
        <h1>BOARDER</h1>
        <p class="muted">Welcome back, ${escapeHtml(p.name)} — ${p.currency} ❄</p>
        <div class="list">
          <button id="downhill">Downhill (idle)</button>
          <button id="half-pipe">Half-pipe</button>
          <button id="upgrades">Upgrades</button>
          <button id="switch">Switch profile</button>
          <button id="settings">Settings</button>
        </div>
      </div>
    `;
    root.querySelector<HTMLButtonElement>('#downhill')!.addEventListener('click', () => resolve('downhill'));
    root.querySelector<HTMLButtonElement>('#half-pipe')!.addEventListener('click', () => resolve('half-pipe'));
    root.querySelector<HTMLButtonElement>('#upgrades')!.addEventListener('click', () => resolve('upgrades'));
    root.querySelector<HTMLButtonElement>('#switch')!.addEventListener('click', () => resolve('switch-profile'));
    root.querySelector<HTMLButtonElement>('#settings')!.addEventListener('click', () => resolve('settings'));
    root.querySelector<HTMLButtonElement>('#menu-settings')!.addEventListener('click', () => resolve('settings'));
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
  )[ch]!);
}
