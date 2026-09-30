import { ProfileService } from '../profiles/ProfileService';
import { bouncyTextHtml } from '../util/bouncyText';
import { escapeHtml } from '../util/escapeHtml';
import { displayFlakes } from '../game/economy';
import { ICON_FLAKE, ICON_PLAY, ICON_STATS, ICON_UPGRADE } from './icons';

export type MenuChoice = 'half-pipe' | 'downhill' | 'switch-profile' | 'upgrades' | 'stats' | 'settings' | 'quit';

export function showMainMenu(root: HTMLElement, profiles: ProfileService): Promise<MenuChoice> {
  return new Promise<MenuChoice>((resolve) => {
    const p = profiles.activeProfile!;
    root.innerHTML = `
      <div class="fullscreen-panel menu-bg menu-bg-stacked splash-bg">
        <button class="gear-btn corner" id="menu-settings" aria-label="Settings"><span class="settings-gear" aria-hidden="true"></span></button>
        <h1 class="title-bouncy">${bouncyTextHtml("Where's the Bottom?")}</h1>
        <div class="menu-profile">
          <span class="pill pill-name">${escapeHtml(p.name)}</span>
          <span class="pill pill-flakes">${ICON_FLAKE}${displayFlakes(p.currency)}</span>
        </div>
        <div class="list menu-list">
          <button id="downhill" class="btn-play">${ICON_PLAY}<span>Downhill <small>idle</small></span></button>
          <button id="half-pipe" class="btn-play btn-alt">${ICON_PLAY}<span>Half-pipe</span></button>
          <div class="menu-grid">
            <button id="upgrades" class="btn-accent">${ICON_UPGRADE}Upgrades</button>
            <button id="stats">${ICON_STATS}Stats</button>
          </div>
          <div class="menu-grid">
            <button id="switch" class="btn-ghost">Switch profile</button>
            <button id="quit" class="btn-ghost danger">Quit game</button>
          </div>
        </div>
      </div>
    `;
    root.querySelector<HTMLButtonElement>('#downhill')!.addEventListener('click', () => resolve('downhill'));
    root.querySelector<HTMLButtonElement>('#half-pipe')!.addEventListener('click', () => resolve('half-pipe'));
    root.querySelector<HTMLButtonElement>('#upgrades')!.addEventListener('click', () => resolve('upgrades'));
    root.querySelector<HTMLButtonElement>('#stats')!.addEventListener('click', () => resolve('stats'));
    root.querySelector<HTMLButtonElement>('#switch')!.addEventListener('click', () => resolve('switch-profile'));
    root.querySelector<HTMLButtonElement>('#quit')!.addEventListener('click', () => resolve('quit'));
    root.querySelector<HTMLButtonElement>('#menu-settings')!.addEventListener('click', () => resolve('settings'));
  });
}
