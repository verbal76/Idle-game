import './style.css';
import './util/debug';
import { IndexedDbStore } from './profiles/IndexedDbStore';
import { ProfileService } from './profiles/ProfileService';
import { showProfileSelect } from './ui/ProfileSelect';
import { showNameSelect } from './ui/NameSelect';
import { showMainMenu, MenuChoice } from './ui/MainMenu';
import { showUpgrades } from './ui/Upgrades';
import { showSettings } from './ui/Settings';
import { showContinuePrompt } from './ui/ContinuePrompt';
import { buildHUD } from './ui/HUD';
import { ArrowPadInput } from './input/ArrowPadInput';
import { soundFx } from './audio/SoundFx';
import { ActionButtons } from './input/ActionButtons';
import { MusicPlayer } from './audio/MusicPlayer';
import { Game } from './scene/Game';
import { Stage } from './scene/Stage';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (data: string) => void };
  }
}

type RunMode = Exclude<MenuChoice, 'switch-profile' | 'upgrades' | 'settings' | 'quit'>;
type RunNext = RunMode | 'upgrades' | null;

function showError(prefix: string, err: unknown): void {
  const msg = (err && (err as { stack?: string }).stack) || String(err);
  const safe = String(msg).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[ch]!);
  document.body.innerHTML =
    `<pre style="color:#ffd1cc;background:#3a0d0d;padding:16px;white-space:pre-wrap;font:14px/1.4 monospace;height:100%;overflow:auto;margin:0">[${prefix}]\n${safe}</pre>`;
}

window.addEventListener('error', (e) => showError('window.error', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => showError('unhandledrejection', e.reason));

// One WebGL engine + template set for the whole session; each run only
// builds its own world on top (see scene/Stage.ts).
let stage: Stage | null = null;
function getStage(canvas: HTMLCanvasElement): Stage {
  stage ??= new Stage(canvas);
  return stage;
}

function setOrientation(mode: 'landscape' | 'default'): void {
  window.ReactNativeWebView?.postMessage(`orientation:${mode}`);
}

async function bootstrap(): Promise<void> {
  const screen = document.getElementById('screen') as HTMLElement;
  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
  // Pre-warm the stage while the player is on the menus so even the
  // first run starts without the engine/template build.
  setTimeout(() => { getStage(canvas); }, 300);

  const profiles = new ProfileService(new IndexedDbStore());
  await profiles.init();

  window.addEventListener('pagehide', () => { void profiles.save(); });

  const music = new MusicPlayer();
  if (profiles.activeProfile) {
    music.setVolume(profiles.activeProfile.settings.musicVolume);
  }
  // 250 ms delay so a freshly OTA-reloaded bundle gives the previous
  // WebView's HTMLAudioElement / Android MediaPlayer time to fully
  // release before this new one starts. Without this gap, the old
  // and new audio elements briefly overlap and the user hears the
  // soundtrack twice, slightly out of phase. On a normal cold start
  // (no prior audio context to compete with) the delay is barely
  // perceptible — well under "the first menu fade-in" duration.
  setTimeout(() => { void music.start(); }, 250);
  const startMusicOnce = () => { void music.start(); };
  document.body.addEventListener('click', startMusicOnce, { capture: true, once: true });

  let pendingMode: RunMode | null = null;
  let promptedAtLoad = false;

  while (true) {
    let mode: RunMode;

    if (pendingMode) {
      mode = pendingMode;
      pendingMode = null;
    } else {
      setOrientation('default');

      if (profiles.activeProfile) {
        music.setVolume(profiles.activeProfile.settings.musicVolume);
      }

      if (!profiles.activeProfile) {
        await showProfileSelect(screen, profiles, music);
        promptedAtLoad = true;
      } else if (!promptedAtLoad) {
        const choice = await showContinuePrompt(screen, profiles);
        promptedAtLoad = true;
        if (choice === 'new') {
          const name = await showNameSelect(screen);
          if (name) {
            const created = await profiles.create(name);
            await profiles.setActive(created.id);
          }
        }
      }

      const choice: MenuChoice = await showMainMenu(screen, profiles);
      if (choice === 'switch-profile') {
        await showProfileSelect(screen, profiles, music);
        continue;
      }
      if (choice === 'upgrades') {
        await showUpgrades(screen, profiles);
        await profiles.save();
        continue;
      }
      if (choice === 'settings') {
        await showSettings(screen, music, profiles);
        continue;
      }
      if (choice === 'quit') {
        await profiles.save();
        window.ReactNativeWebView?.postMessage('quit:app');
        return;
      }
      mode = choice;
    }

    setOrientation('landscape');
    try {
      const next = await runSession(screen, canvas, mode, profiles, music);
      if (next === 'upgrades') {
        await showUpgrades(screen, profiles);
        await profiles.save();
      } else if (next) {
        pendingMode = next;
      }
    } finally {
      await profiles.save();
    }
  }
}

async function runSession(
  screen: HTMLElement,
  canvas: HTMLCanvasElement,
  mode: RunMode,
  profiles: ProfileService,
  music: MusicPlayer,
): Promise<RunNext> {
  return new Promise<RunNext>((resolve) => {
    screen.innerHTML = '';
    const hud = buildHUD(screen);
    const dpad = new ArrowPadInput(hud.leftBtn, hud.rightBtn, hud.upBtn);
    const buttons = new ActionButtons(hud.jumpBtn, hud.flipBtn);
    const wake = () => {
      soundFx.resume();
      hud.hud.removeEventListener('pointerdown', wake);
    };
    hud.hud.addEventListener('pointerdown', wake);
    const upgrades = profiles.activeProfile!.upgrades
      ?? { speed: 0, jump: 0, turn: 0, charge: 0, spin: 0, coin: 0 };

    hud.switchBtn.textContent = mode === 'half-pipe' ? 'Switch to Downhill' : 'Switch to Half-pipe';

    const game = new Game(getStage(canvas), mode, {
      leftStick: () => dpad.left,
      jumpHeld: () => buttons.jumpHeld,
      flipHeld: () => buttons.flipHeld,
      forwardHeld: () => dpad.upHeld,
    }, {
      onScore: (label) => { hud.score.textContent = label; },
      onComboChange: (count, mult) => {
        if (count <= 0) { hud.comboBar.style.display = 'none'; return; }
        hud.comboBar.style.display = 'flex';
        hud.comboMult.textContent = `×${mult.toFixed(1)}`;
        hud.comboCount.textContent = `${count} chain`;
      },
      onRingStreak: (streak, best) => {
        if (streak <= 0 && best <= 0) {
          hud.ringWidget.style.display = 'none';
          return;
        }
        hud.ringWidget.style.display = 'flex';
        hud.ringStreak.textContent = String(streak);
        hud.ringBest.textContent = `best ${best}`;
      },
      onHalfpipeIntro: () => {
        hud.halfpipeIntro.style.display = 'flex';
        const dismiss = () => {
          hud.halfpipeIntro.style.display = 'none';
          hud.halfpipeIntro.removeEventListener('click', dismiss);
          clearTimeout(timer);
        };
        const timer = setTimeout(dismiss, 6000);
        hud.halfpipeIntro.addEventListener('click', dismiss);
      },
      onFell: (stats) => {
        hud.fellStats.textContent =
          `Distance: ${stats.distanceMeters} m  •  +${stats.coins} ❄  •  Flips: ${stats.flips}`;
        hud.fellOverlay.style.display = 'flex';
      },
      onChargeChange: (charge) => {
        const v = String(charge);
        hud.jumpBtn.style.setProperty('--charge', v);
        hud.jumpChargeBar.style.setProperty('--charge', v);
        hud.jumpChargeBar.classList.toggle('full', charge >= 0.99);
      },
    }, upgrades);
    game.setBankSnapshot(profiles.activeProfile?.currency ?? 0);
    game.start();

    let finished = false;
    const finish = (next: RunNext) => {
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

    hud.settingsBtn.addEventListener('click', async () => {
      game.pause();
      hud.settingsOverlay.style.display = 'flex';
      await showSettings(hud.settingsOverlay, music, profiles);
      hud.settingsOverlay.style.display = 'none';
      hud.settingsOverlay.innerHTML = '';
      game.resume();
    });
    hud.switchBtn.addEventListener('click', () => {
      finish(mode === 'half-pipe' ? 'downhill' : 'half-pipe');
    });
    hud.quitBtn.addEventListener('click', () => finish(null));
    hud.fellOkBtn.addEventListener('click', () => finish(null));
    hud.fellSwitchBtn.addEventListener('click', () => {
      finish(mode === 'half-pipe' ? 'downhill' : 'half-pipe');
    });
    hud.fellUpgradesBtn.addEventListener('click', () => finish('upgrades'));

    hud.pauseUpgradesBtn.addEventListener('click', async () => {
      hud.pauseMenu.style.display = 'none';
      hud.settingsOverlay.style.display = 'flex';
      await showUpgrades(hud.settingsOverlay, profiles);
      await profiles.save();
      hud.settingsOverlay.style.display = 'none';
      hud.settingsOverlay.innerHTML = '';
      game.setBankSnapshot(profiles.activeProfile?.currency ?? 0);
      hud.pauseMenu.style.display = 'flex';
    });
    hud.pauseSettingsBtn.addEventListener('click', async () => {
      hud.pauseMenu.style.display = 'none';
      hud.settingsOverlay.style.display = 'flex';
      await showSettings(hud.settingsOverlay, music, profiles);
      hud.settingsOverlay.style.display = 'none';
      hud.settingsOverlay.innerHTML = '';
      hud.pauseMenu.style.display = 'flex';
    });
  });
}

bootstrap().catch((err) => showError('bootstrap', err));
