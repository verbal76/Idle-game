import './style.css';
import { IndexedDbStore } from './profiles/IndexedDbStore';
import { ProfileService } from './profiles/ProfileService';
import { showProfileSelect } from './ui/ProfileSelect';
import { showMainMenu, MenuChoice } from './ui/MainMenu';
import { showUpgrades } from './ui/Upgrades';
import { buildHUD } from './ui/HUD';
import { TwinStickInput } from './input/TwinStickInput';
import { ActionButtons } from './input/ActionButtons';
import { Game } from './scene/Game';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (data: string) => void };
  }
}

// Visible error overlay — anything thrown anywhere in the app gets dumped on
// screen. Useful when the WebView's only debug surface is what we render.
function showError(prefix: string, err: unknown): void {
  const msg = (err && (err as { stack?: string }).stack) || String(err);
  const safe = String(msg).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[ch]!);
  document.body.innerHTML =
    `<pre style="color:#ffd1cc;background:#3a0d0d;padding:16px;white-space:pre-wrap;font:14px/1.4 monospace;height:100%;overflow:auto;margin:0">[${prefix}]\n${safe}</pre>`;
}

window.addEventListener('error', (e) => showError('window.error', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => showError('unhandledrejection', e.reason));

function setOrientation(mode: 'landscape' | 'default'): void {
  window.ReactNativeWebView?.postMessage(`orientation:${mode}`);
}

async function bootstrap(): Promise<void> {
  const screen = document.getElementById('screen') as HTMLElement;
  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;

  const profiles = new ProfileService(new IndexedDbStore());
  await profiles.init();

  while (true) {
    setOrientation('default');

    if (!profiles.activeProfile) await showProfileSelect(screen, profiles);

    const choice: MenuChoice = await showMainMenu(screen, profiles);
    if (choice === 'switch-profile') {
      await showProfileSelect(screen, profiles);
      continue;
    }
    if (choice === 'upgrades') {
      await showUpgrades(screen, profiles);
      await profiles.save();
      continue;
    }

    setOrientation('landscape');
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
  mode: Exclude<MenuChoice, 'switch-profile' | 'upgrades'>,
  profiles: ProfileService
): Promise<void> {
  return new Promise<void>((resolve) => {
    screen.innerHTML = '';
    const hud = buildHUD(screen);
    const sticks = new TwinStickInput(hud.leftStick);
    const buttons = new ActionButtons(hud.jumpBtn, hud.flipBtn);
    const upgrades = profiles.activeProfile!.upgrades ?? { speed: 0, jump: 0, magnet: 0 };

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
    }, upgrades);
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

bootstrap().catch((err) => showError('bootstrap', err));
