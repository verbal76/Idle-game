import { ProfileService } from '../profiles/ProfileService';
import { bouncyTextHtml } from '../util/bouncyText';

export type MenuChoice = 'half-pipe' | 'downhill' | 'switch-profile' | 'upgrades' | 'settings' | 'quit';

export function showMainMenu(root: HTMLElement, profiles: ProfileService): Promise<MenuChoice> {
  return new Promise<MenuChoice>((resolve) => {
    const p = profiles.activeProfile!;
    root.innerHTML = `
      <div class="fullscreen-panel menu-bg menu-bg-stacked">
        <button class="gear-btn corner" id="menu-settings" aria-label="Settings">⚙</button>
        <h1 class="title-bouncy">${bouncyTextHtml("Where's the Bottom?")}</h1>
        <p class="muted">${escapeHtml(p.name)} — ${p.currency} ❄</p>
        <div class="list">
          <button id="downhill">Downhill (idle)</button>
          <button id="half-pipe">Half-pipe</button>
          <button id="upgrades">Upgrades</button>
          <button id="switch">Switch profile</button>
          <button id="quit" class="danger">Quit game</button>
        </div>
      </div>
    `;
    root.querySelector<HTMLButtonElement>('#downhill')!.addEventListener('click', () => resolve('downhill'));
    root.querySelector<HTMLButtonElement>('#half-pipe')!.addEventListener('click', () => resolve('half-pipe'));
    root.querySelector<HTMLButtonElement>('#upgrades')!.addEventListener('click', () => resolve('upgrades'));
    root.querySelector<HTMLButtonElement>('#switch')!.addEventListener('click', () => resolve('switch-profile'));
    root.querySelector<HTMLButtonElement>('#quit')!.addEventListener('click', () => resolve('quit'));
    root.querySelector<HTMLButtonElement>('#menu-settings')!.addEventListener('click', () => resolve('settings'));
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
  )[ch]!);
}
