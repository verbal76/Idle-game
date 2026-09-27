import './style.css';
import './util/debug';
import { IndexedDbStore } from './profiles/IndexedDbStore';
import { ProfileService } from './profiles/ProfileService';
import { showProfileSelect } from './ui/ProfileSelect';
import { showNameSelect } from './ui/NameSelect';
import { showMainMenu, MenuChoice } from './ui/MainMenu';
import { showUpgrades } from './ui/Upgrades';
import { showStats } from './ui/Stats';
import { showSettings } from './ui/Settings';
import { showContinuePrompt } from './ui/ContinuePrompt';
import { buildHUD, showHalfpipeIntro } from './ui/HUD';
import { ArrowPadInput } from './input/ArrowPadInput';
import { soundFx } from './audio/SoundFx';
import { ActionButtons } from './input/ActionButtons';
import { MusicPlayer } from './audio/MusicPlayer';
import { Game } from './scene/Game';
import { Stage } from './scene/Stage';
import { bankRun, migrateDeviceRingBest, type BankResult } from './game/records';
import { buildRunSummary } from './game/summary';
import { runSummaryHtml } from './ui/RunSummary';
import { clearPending, collectPending, hasCollectablePending, recordPending } from './game/pendingRun';
import { installBackBridge, pushBackHandler } from './util/backButton';
import { showInterrupted } from './ui/Interrupted';
import { createCallouts } from './ui/Callouts';
import { graceCallout, trickCallout } from './game/callout';
import { awardGoals, goalLines, type GoalAward } from './game/goals';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (data: string) => void };
  }
}

type RunMode = Exclude<MenuChoice, 'switch-profile' | 'upgrades' | 'stats' | 'settings' | 'quit'>;
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

  installBackBridge();
  const profiles = new ProfileService(new IndexedDbStore());
  await profiles.init();
  // One-time: the old device-wide ring best becomes the active profile's.
  let storage: Storage | undefined;
  try { storage = window.localStorage; } catch { storage = undefined; }
  if (migrateDeviceRingBest(profiles.activeProfile, storage)) await profiles.save();

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

      // A run cut short by an app kill/crash/reload: show it and bank it
      // once on Collect (credit + clear are one save of the profile).
      const interrupted = profiles.activeProfile;
      if (interrupted?.pendingRun) {
        if (hasCollectablePending(interrupted)) {
          await showInterrupted(screen, interrupted, interrupted.pendingRun);
          const collected = collectPending(interrupted);
          if (collected) awardGoals(interrupted, collected.run, Date.now());
        } else {
          clearPending(interrupted);
        }
        await profiles.save();
      }
      // No-op after the first time; covers installs with no profile at boot.
      if (migrateDeviceRingBest(profiles.activeProfile, storage)) await profiles.save();
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
      if (choice === 'stats') {
        await showStats(screen, profiles.activeProfile!);
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
    // The native shell holds any downloaded OTA until run:end, which is
    // only sent once the finished run has been saved.
    window.ReactNativeWebView?.postMessage('run:start');
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
      // Switch Style goes straight into the next run: stay "in run".
      if (!pendingMode) window.ReactNativeWebView?.postMessage('run:end');
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
      ?? { speed: 0, jump: 0, turn: 0, charge: 0, spin: 0, flip: 0, coin: 0, ringMagnet: 0, comboWindow: 0, grace: 0 };

    hud.switchBtn.textContent = mode === 'half-pipe' ? 'Switch to Downhill' : 'Switch to Half-pipe';

    let crashed = false;
    const callout = createCallouts(hud.hud);
    const game = new Game(getStage(canvas), mode, {
      leftStick: () => dpad.left,
      jumpHeld: () => buttons.jumpHeld,
      flipHeld: () => buttons.flipHeld,
      forwardHeld: () => dpad.upHeld,
    }, {
      onHud: (h) => hud.setReadout(h),
      onTrick: (t) => callout(trickCallout(t)),
      onGrace: (left) => callout(graceCallout(left)),
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
      // Lock the pause/settings controls the moment the run-ending hit
      // lands, so the pause menu can't open under the fell screen.
      onCrash: () => {
        crashed = true;
        savePending();
        hud.pauseBtn.disabled = true;
        hud.settingsBtn.disabled = true;
        hud.hud.classList.add('run-over');
      },
      onFell: () => showRunSummary('You fell'),
      onChargeChange: (charge) => {
        const v = String(charge);
        hud.jumpBtn.style.setProperty('--charge', v);
        hud.jumpChargeBar.style.setProperty('--charge', v);
        hud.jumpChargeBar.classList.toggle('full', charge >= 0.99);
      },
    }, upgrades, { bestRingStreak: profiles.activeProfile?.stats.halfPipe.bestRingStreak ?? 0 });
    game.setBankSnapshot(profiles.activeProfile?.currency ?? 0);
    game.start();
    // First half-pipe ride for this profile: show the how-to card with
    // the run paused until the player taps it. Afterwards it lives in the
    // pause menu as "How to play".
    if (mode === 'half-pipe') {
      hud.pauseHowToBtn.style.display = '';
      const p = profiles.activeProfile;
      if (p && !p.seenHalfpipeIntro) {
        game.pause();
        void showHalfpipeIntro(hud).then(async () => {
          p.seenHalfpipeIntro = true;
          await profiles.save();
          if (!finished) game.resume();
        });
      }
    }
    // End-to-end test hook (only when the page URL carries ?e2e).
    if (location.search.includes('e2e')) (window as unknown as { __wtb?: unknown }).__wtb = { game };

    // Mirror the live run into the profile (unbanked) so an app kill
    // can't erase it; see game/pendingRun.ts.
    const runId = crypto.randomUUID();
    const savePending = () => {
      const active = profiles.activeProfile;
      // Once banked (summary on screen) the mirror must never come back,
      // or the next launch would offer the run a second time.
      if (finished || banked || !active) return;
      recordPending(active, runId, game.getRunStats(), Date.now());
      void profiles.save();
    };
    const pendingTimer = setInterval(savePending, 2000);

    const openPause = () => {
      if (crashed || finished) return;
      savePending();
      game.pause();
      hud.pauseMenu.style.display = 'flex';
    };
    const closePause = () => {
      hud.pauseMenu.style.display = 'none';
      game.resume();
    };
    const isShown = (el: HTMLElement) => el.style.display === 'flex';

    // Backgrounding the app pauses the run (and saves the mirror).
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        savePending();
        if (!isShown(hud.pauseMenu) && !isShown(hud.settingsOverlay) && !isShown(hud.halfpipeIntro)) openPause();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', savePending);

    // Android Back: open the pause menu; Back again resumes. On the fell
    // screen it goes back to the menu. Sub-panels swallow it.
    const popBack = pushBackHandler(() => {
      if (finished) return false;
      if (isShown(hud.fellOverlay)) { finish(null); return true; }
      if (isShown(hud.settingsOverlay) || isShown(hud.halfpipeIntro)) return true;
      if (isShown(hud.pauseMenu)) { closePause(); return true; }
      openPause();
      return true;
    });

    // Banks the run exactly once (credit + records + clearing the pending
    // mirror land in one profile save) the moment the run is over.
    let banked: BankResult | null = null;
    let goalAwards: GoalAward[] = [];
    const bankNow = () => {
      const active = profiles.activeProfile;
      if (banked || !active) return;
      const stats = game.getRunStats();
      clearPending(active);
      banked = bankRun(active, stats);
      goalAwards = awardGoals(active, stats, Date.now());
      void profiles.save();
      return stats;
    };
    // The end-of-run screen: earnings breakdown + records (NEW BEST).
    const showRunSummary = (title: string) => {
      const stats = game.getRunStats();
      bankNow();
      const active = profiles.activeProfile;
      if (!active || !banked) return;
      hud.fellTitle.textContent = title;
      hud.fellStats.innerHTML = runSummaryHtml(buildRunSummary(stats, banked, active.stats, goalLines(goalAwards)));
      hud.pauseMenu.style.display = 'none';
      hud.fellOverlay.style.display = 'flex';
    };

    let finished = false;
    const finish = (next: RunNext) => {
      if (finished) return;
      finished = true;
      clearInterval(pendingTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', savePending);
      popBack();

      bankNow();                       // Switch Style skips the summary
      game.dispose();
      dpad.detach();
      buttons.detach();
      resolve(next);
    };

    hud.pauseBtn.addEventListener('click', openPause);
    hud.resumeBtn.addEventListener('click', closePause);

    hud.settingsBtn.addEventListener('click', async () => {
      if (crashed) return;
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
    // Quitting shows the same summary as a fall (the run stays paused).
    hud.quitBtn.addEventListener('click', () => {
      crashed = true;
      hud.hud.classList.add('run-over');
      showRunSummary('Run over');
    });
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
    hud.pauseHowToBtn.addEventListener('click', async () => {
      hud.pauseMenu.style.display = 'none';
      await showHalfpipeIntro(hud);
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
