import './style.css';
// Side-effect import: starts the rotating debug log + console.error
// capture before anything else runs, so a JS error during the rest
// of bootstrap is included in the next bug report.
import './util/debug';
import { IndexedDbStore } from './profiles/IndexedDbStore';
import { ProfileService } from './profiles/ProfileService';
import { showProfileSelect } from './ui/ProfileSelect';
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

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (data: string) => void };
  }
}

type RunMode = Exclude<MenuChoice, 'switch-profile' | 'upgrades' | 'settings' | 'quit'>;
// Extra exit codes that runSession can return so the bootstrap loop
// knows the player wants to detour to Upgrades before the next run.
// "Pause-menu Upgrades" stays in-game (overlay), but the fall overlay
// can also pick this since the run is already over there.
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

function setOrientation(mode: 'landscape' | 'default'): void {
  window.ReactNativeWebView?.postMessage(`orientation:${mode}`);
}

async function bootstrap(): Promise<void> {
  const screen = document.getElementById('screen') as HTMLElement;
  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;

  const profiles = new ProfileService(new IndexedDbStore());
  await profiles.init();

  // pagehide / beforeunload safety net: if the WebView is force-
  // closed mid-run (Android back-press, OOM, browser tab close),
  // the run's `finish()` deferred .save() never runs and the
  // in-memory currency increment evaporates. Fire-and-forget save
  // here gives IndexedDB ~hundreds of ms to flush before the page
  // dies. pagehide is preferred over beforeunload (newer browsers
  // discourage beforeunload listeners and pagehide fires earlier
  // in the lifecycle on mobile).
  window.addEventListener('pagehide', () => { void profiles.save(); });

  // Background music — single instance owned by bootstrap so it survives
  // run-restart cycles. Initial volume seeded from the saved profile;
  // settings UI mutates both the player and the profile field.
  // Autoplay is blocked until the first user gesture; the menu-button
  // listener below kicks off playback once the user taps anything.
  const music = new MusicPlayer();
  if (profiles.activeProfile) {
    music.setVolume(profiles.activeProfile.settings.musicVolume);
  }
  // App.tsx sets `mediaPlaybackRequiresUserAction={false}` on the
  // WebView, so autoplay is permitted on Android. Kick playback now —
  // if URLs haven't arrived yet, MusicPlayer.start() flips wantPlaying
  // and the music-urls event listener fires playback the moment the
  // injected URLs land. Browsers / Expo Go that still block autoplay
  // catch the rejection silently; the click listener below acts as a
  // last-resort retry on the first menu interaction.
  void music.start();
  const startMusicOnce = () => { void music.start(); };
  document.body.addEventListener('click', startMusicOnce, { capture: true, once: true });

  // pendingMode lets the pause-menu Switch Style button start the next
  // run directly in the other mode without bouncing back through the
  // main menu.
  let pendingMode: RunMode | null = null;

  // Skip the load-time continue prompt the first time we see an active
  // profile (the active id was restored by profiles.init()). On
  // subsequent loops the player has already chosen, so the main menu
  // is enough — we don't want to re-prompt every time they back out
  // of a run.
  let promptedAtLoad = false;

  while (true) {
    let mode: RunMode;

    if (pendingMode) {
      mode = pendingMode;
      pendingMode = null;
    } else {
      setOrientation('default');

      // Re-sync music volume from the active profile each loop in case
      // the player switched profiles since the last menu pass.
      if (profiles.activeProfile) {
        music.setVolume(profiles.activeProfile.settings.musicVolume);
      }

      if (!profiles.activeProfile) {
        await showProfileSelect(screen, profiles, music);
        promptedAtLoad = true;
      } else if (!promptedAtLoad) {
        // First view of the saved profile this session: confirm the
        // player wants to keep going as them, or send them to profile
        // select if they want to swap.
        const choice = await showContinuePrompt(screen, profiles);
        promptedAtLoad = true;
        if (choice === 'switch') {
          await showProfileSelect(screen, profiles, music);
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
        // Native side handles the exit; web side stops the loop so we
        // don't keep painting menus while the WebView tears down.
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
        // Player picked Upgrades on the fall overlay. Show the shop
        // before bouncing them to the main menu so they can spend
        // immediately without an extra menu hop.
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
    // Resume the SoundFx AudioContext on the first user input.
    // Browsers (Chrome, Safari, Android WebView) keep it suspended
    // until the user gestures, so the very first ring chime / boost
    // whoosh would otherwise drop silently.
    const wake = () => {
      soundFx.resume();
      hud.hud.removeEventListener('pointerdown', wake);
    };
    hud.hud.addEventListener('pointerdown', wake);
    const upgrades = profiles.activeProfile!.upgrades
      ?? { speed: 0, jump: 0, magnet: 0, turn: 0, charge: 0, spin: 0, coin: 0 };

    // Label the Switch Style button to indicate the destination mode,
    // not the current one. Reads as a target the player is choosing.
    hud.switchBtn.textContent = mode === 'half-pipe' ? 'Switch to Downhill' : 'Switch to Half-pipe';

    const game = new Game(canvas, mode, {
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
      // Halfpipe ring streak HUD. Show the widget if either the
      // current streak or the persistent best is non-zero — so a
      // returning player sees their best ring count from the moment
      // they enter the pipe.
      onRingStreak: (streak, best) => {
        if (streak <= 0 && best <= 0) {
          hud.ringWidget.style.display = 'none';
          return;
        }
        hud.ringWidget.style.display = 'flex';
        hud.ringStreak.textContent = String(streak);
        hud.ringBest.textContent = `best ${best}`;
      },
      // First-time intro overlay for the halfpipe. Auto-dismisses
      // after 6 s OR on tap, whichever comes first. Single shared
      // dismiss handler so we don't leak listeners across sessions.
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
      // onFell only paints the overlay. Currency is credited in finish()
      // below — that way Quit and Switch Style also keep what you earned.
      onFell: (stats) => {
        hud.fellStats.textContent =
          `Distance: ${stats.distanceMeters} m  •  +${stats.coins} ❄  •  Flips: ${stats.flips}`;
        hud.fellOverlay.style.display = 'flex';
      },
      // Drive the JUMP button's conic-gradient ring AND the vertical
      // charge bar on the far right via the same CSS var. The right-
      // edge bar is the primary indicator since the user's thumb
      // covers the button itself; bar stays visible bar-only and
      // pulses when the charge hits max.
      onChargeChange: (charge) => {
        const v = String(charge);
        hud.jumpBtn.style.setProperty('--charge', v);
        hud.jumpChargeBar.style.setProperty('--charge', v);
        hud.jumpChargeBar.classList.toggle('full', charge >= 0.99);
      },
    }, upgrades);
    // Seed the live-bank counter shown on the HUD so the player sees
    // their persistent total grow during the run instead of a 0-coin
    // counter that resets each session. Game internally adds
    // coinsCollected on top of this for the score-line label.
    game.setBankSnapshot(profiles.activeProfile?.currency ?? 0);
    game.start();

    // finish() is the single exit point — natural fall, quit, or switch.
    // Pulls live snowflake/distance stats from the game so the player
    // always keeps what they earned regardless of how the run ends.
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
      // In-game settings: pause the run, show the full Settings panel
      // inline (volume slider, skip track, About) in the existing
      // settings-overlay div, then resume on close. Same widget the
      // menu screens use so volume changes here persist exactly the
      // same way as from the lobby.
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
    // Fell-overlay → Upgrades shortcut. Run is already over (coins
    // banked when finish runs), the bootstrap loop will show the
    // Upgrades shop before returning to the main menu.
    hud.fellUpgradesBtn.addEventListener('click', () => finish('upgrades'));

    // Pause-menu Upgrades. Doesn't end the run — opens the shop as
    // an overlay over the paused game, then refreshes the bank
    // snapshot when the shop closes (the player may have spent
    // coins) and re-shows the pause menu.
    hud.pauseUpgradesBtn.addEventListener('click', async () => {
      hud.pauseMenu.style.display = 'none';
      hud.settingsOverlay.style.display = 'flex';
      await showUpgrades(hud.settingsOverlay, profiles);
      await profiles.save();
      hud.settingsOverlay.style.display = 'none';
      hud.settingsOverlay.innerHTML = '';
      // Refresh the live-bank baseline so the score line shows the
      // post-spend total immediately on next render.
      game.setBankSnapshot(profiles.activeProfile?.currency ?? 0);
      hud.pauseMenu.style.display = 'flex';
    });
    // Pause-menu Settings. Same overlay flow as the gear button —
    // duplicated here so all the run-management options live in
    // one place per the user's "uniform menus" feedback.
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
