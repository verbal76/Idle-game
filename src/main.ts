import './style.css';
import { IndexedDbStore } from './profiles/IndexedDbStore';
import { ProfileService } from './profiles/ProfileService';
import { showProfileSelect } from './ui/ProfileSelect';
import { showMainMenu, MenuChoice } from './ui/MainMenu';
import { showUpgrades } from './ui/Upgrades';
import { buildHUD } from './ui/HUD';
import { ArrowPadInput } from './input/ArrowPadInput';
import { ActionButtons } from './input/ActionButtons';
import { Game } from './scene/Game';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (data: string) => void };
  }
}

type RunMode = Exclude<MenuChoice, 'switch-profile' | 'upgrades'>;

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

  // pendingMode lets the pause-menu Switch Style button start the next
  // run directly in the other mode without bouncing back through the
  // main menu.
  let pendingMode: RunMode | null = null;

  while (true) {
    let mode: RunMode;

    if (pendingMode) {
      mode = pendingMode;
      pendingMode = null;
    } else {
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
      mode = choice;
    }

    setOrientation('landscape');
    try {
      const next = await runSession(screen, canvas, mode, profiles);
      if (next) pendingMode = next;
    } finally {
      await profiles.save();
    }
  }
}

async function runSession(
  screen: HTMLElement,
  canvas: HTMLCanvasElement,
  mode: RunMode,
  profiles: ProfileService
): Promise<RunMode | null> {
  return new Promise<RunMode | null>((resolve) => {
    screen.innerHTML = '';
    const hud = buildHUD(screen);
    const dpad = new ArrowPadInput(hud.leftBtn, hud.rightBtn);
    const buttons = new ActionButtons(hud.jumpBtn, hud.flipBtn);
    const upgrades = profiles.activeProfile!.upgrades ?? { speed: 0, jump: 0, magnet: 0 };

    // Label the Switch Style button to indicate the destination mode,
    // not the current one. Reads as a target the player is choosing.
    hud.switchBtn.textContent = mode === 'half-pipe' ? 'Switch to Downhill' : 'Switch to Half-pipe';

    const game = new Game(canvas, mode, {
      leftStick: () => dpad.left,
      jumpHeld: () => buttons.jumpHeld,
      flipHeld: () => buttons.flipHeld,
    }, {
      onScore: (label) => { hud.score.textContent = label; },
      // onFell only paints the overlay. Currency is credited in finish()
      // below — that way Quit and Switch Style also keep what you earned.
      onFell: (stats) => {
        hud.fellStats.textContent =
          `Distance: ${stats.distanceMeters} m  •  +${stats.coins} ❄  •  Flips: ${stats.flips}`;
        hud.fellOverlay.style.display = 'flex';
      },
    }, upgrades);
    game.start();

    // finish() is the single exit point — natural fall, quit, or switch.
    // Pulls live snowflake/distance stats from the game so the player
    // always keeps what they earned regardless of how the run ends.
    let finished = false;
    const finish = (next: RunMode | null) => {
      if (finished) return;
      finished = true;

      const stats = game.getRunStats();
      const active = profiles.activeProfile;
      if (active) {
        active.currency += stats.coins;
        if (stats.distanceMeters > active.longestDownhillMeters) {
          active.longestDownhillMeters = stats.distanceMeters;
        }
      }
      game.dispose();
      dpad.detach();
      buttons.detach();
      resolve(next);
    };

    hud.pauseBtn.addEventListener('click', () => {
      game.pause();
      hud.pauseMenu.style.display = 'flex';
    });
    hud.resumeBtn.addEventListener('click', () => {
      hud.pauseMenu.style.display = 'none';
      game.resume();
    });
    hud.switchBtn.addEventListener('click', () => {
      finish(mode === 'half-pipe' ? 'downhill' : 'half-pipe');
    });
    hud.quitBtn.addEventListener('click', () => finish(null));
    hud.fellOkBtn.addEventListener('click', () => finish(null));
  });
}

bootstrap().catch((err) => showError('bootstrap', err));
