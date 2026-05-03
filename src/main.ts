import './style.css';
import { IndexedDbStore } from './profiles/IndexedDbStore';
import { ProfileService } from './profiles/ProfileService';
import { showProfileSelect } from './ui/ProfileSelect';
import { showMainMenu, MenuChoice } from './ui/MainMenu';
import { buildHUD } from './ui/HUD';
import { TwinStickInput } from './input/TwinStickInput';
import { ActionButtons } from './input/ActionButtons';
import { Game } from './scene/Game';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (data: string) => void };
  }
}

function setOrientation(mode: 'landscape' | 'default'): void {
  window.ReactNativeWebView?.postMessage(`orientation:${mode}`);
}

async function bootstrap(): Promise<void> {
  const screen = document.getElementById('screen') as HTMLElement;
  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;

  const profiles = new ProfileService(new IndexedDbStore());
  await profiles.init();

  while (true) {
    setOrientation('default'); // menus allow either orientation

    if (!profiles.activeProfile) await showProfileSelect(screen, profiles);

    const choice: MenuChoice = await showMainMenu(screen, profiles);
    if (choice === 'switch-profile') {
      await showProfileSelect(screen, profiles);
      continue;
    }

    setOrientation('landscape'); // lock during action
    try {
      await runSession(screen, canvas, choice, profiles);
    } finally {
      await profiles.save();
    }
  }
}

async function runSession(
  screen: HTMLElement,
  canvas: HTMLCanvasElement,
  mode: Exclude<MenuChoice, 'switch-profile'>,
  profiles: ProfileService
): Promise<void> {
  return new Promise<void>((resolve) => {
    screen.innerHTML = '';
    const hud = buildHUD(screen);
    const sticks = new TwinStickInput(hud.leftStick);
    const buttons = new ActionButtons(hud.jumpBtn, hud.flipBtn);

    const game = new Game(canvas, mode, {
      leftStick: () => sticks.left,
      jumpHeld: () => buttons.jumpHeld,
      flipHeld: () => buttons.flipHeld,
    }, {
      onScore: (label) => { hud.score.textContent = label; },
      onFell: (stats) => {
        const active = profiles.activeProfile;
        if (active) {
          active.currency += stats.coins;
          if (stats.distanceMeters > active.longestDownhillMeters) {
            active.longestDownhillMeters = stats.distanceMeters;
          }
        }
        hud.fellStats.textContent =
          `Distance: ${stats.distanceMeters} m  •  Coins: +${stats.coins}  •  Flips: ${stats.flips}`;
        hud.fellOverlay.style.display = 'flex';
      },
    });
    game.start();

    const finish = () => {
      game.dispose();
      sticks.detach();
      buttons.detach();
      resolve();
    };

    hud.pauseBtn.addEventListener('click', () => {
      game.pause();
      hud.pauseMenu.style.display = 'flex';
    });
    hud.resumeBtn.addEventListener('click', () => {
      hud.pauseMenu.style.display = 'none';
      game.resume();
    });
    hud.quitBtn.addEventListener('click', finish);
    hud.fellOkBtn.addEventListener('click', finish);
  });
}

bootstrap().catch((err) => {
  document.body.innerHTML = `<pre style="color:#fff;padding:16px;white-space:pre-wrap">${(err && err.stack) || err}</pre>`;
});
