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
import { haptics } from './util/haptics';
import { ActionButtons } from './input/ActionButtons';
import { MusicPlayer } from './audio/MusicPlayer';
import { Game } from './scene/Game';
import { Stage } from './scene/Stage';
import { bankRun, migrateDeviceRingBest, type BankResult } from './game/records';
import { buildRunSummary } from './game/summary';
import { runSummaryHtml } from './ui/RunSummary';
import { clearPending, collectPending, hasCollectablePending, recordPending } from './game/pendingRun';
import { clickScreenBack, installBackBridge, pushBackHandler } from './util/backButton';
import { showInterrupted } from './ui/Interrupted';
import { createCallouts } from './ui/Callouts';
import { graceCallout, trickCallout } from './game/callout';
import { awardGoals, goalLines, type GoalAward } from './game/goals';
import { showFatalError } from './ui/FatalError';
import { statusBanner } from './ui/StatusBanner';
import { MemoryStore } from './profiles/MemoryStore';
import type { ProfileStore } from './profiles/IndexedDbStore';
import { installTapGuard } from './ui/tapGuard';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (data: string) => void };
  }
}

type RunMode = Exclude<MenuChoice, 'switch-profile' | 'upgrades' | 'stats' | 'settings' | 'quit'>;
type RunNext = RunMode | 'upgrades' | null;

// Error policy: only a failure to start is fatal (showFatalError). After
// that, a stray error in a callback is logged (util/debug keeps the tail
// for bug reports) and the game carries on; a fault inside a frame ends
// the run cleanly (Game onFault); storage faults are retried by
// ProfileService and shown as a banner.
let booted = false;
window.addEventListener('error', (e) => {
  if (!booted) showFatalError('startup', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandledrejection]', e.reason);
});

/** IndexedDB, or (if the device refuses it) memory for this session only. */
async function openStore(): Promise<{ store: ProfileStore; persistent: boolean }> {
  const idb = new IndexedDbStore();
  try {
    await Promise.race([
      idb.ready(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('IndexedDB open timed out')), 6000)),
    ]);
    return { store: idb, persistent: true };
  } catch (e) {
    console.error('[profiles] storage unavailable; progress kept for this session only', e);
    return { store: new MemoryStore(), persistent: false };
  }
}

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

/** Tells the native shell whether a reload would interrupt anything. */
function uiIdle(idle: boolean): void {
  window.ReactNativeWebView?.postMessage(idle ? 'ui:idle' : 'ui:busy');
}

async function bootstrap(): Promise<void> {
  const screen = document.getElementById('screen') as HTMLElement;
  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
  // Pre-warm the stage while the player is on the menus so even the
  // first run starts without the engine/template build.
  setTimeout(() => { getStage(canvas); }, 300);

  installBackBridge();
  installTapGuard();
  const { store, persistent } = await openStore();
  const profiles = new ProfileService(store);
  await profiles.init();
  if (!persistent) statusBanner('storage')('Saving isn\u2019t available on this device right now \u2014 progress lasts until you close the game.');
  const saveBanner = statusBanner('save');
  profiles.onStatus((s) => saveBanner(s === 'failing' ? 'Progress isn\u2019t saving \u2014 retrying\u2026' : null));
  // One-time: the old device-wide ring best becomes the active profile's.
  let storage: Storage | undefined;
  try { storage = window.localStorage; } catch { storage = undefined; }
  if (migrateDeviceRingBest(profiles.activeProfile, storage)) await profiles.save();

  window.addEventListener('pagehide', () => { void profiles.save(); });
  // The native shell calls this just before it reloads for an update.
  (window as unknown as { __wtbBeforeReload?: () => void }).__wtbBeforeReload = () => { void profiles.save(); };

  const music = new MusicPlayer();
  if (profiles.activeProfile) {
    music.setVolume(profiles.activeProfile.settings.musicVolume);
    soundFx.setVolume(profiles.activeProfile.settings.sfxVolume);
    haptics.setEnabled(profiles.activeProfile.settings.haptics);
  }
  // A soft tick on menu buttons (not the in-run controls).
  document.addEventListener('pointerdown', (e) => {
    const b = (e.target as Element | null)?.closest?.('.fullscreen-panel button');
    if (b && !(b as HTMLButtonElement).disabled) { soundFx.resume(); soundFx.play('tap'); }
  }, { capture: true });
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
  // Started: from here on a stray error is logged, not fatal.
  booted = true;

  while (true) {
    let mode: RunMode;

    if (pendingMode) {
      mode = pendingMode;
      pendingMode = null;
    } else {
      setOrientation('default');

      if (profiles.activeProfile) {
        music.setVolume(profiles.activeProfile.settings.musicVolume);
        soundFx.setVolume(profiles.activeProfile.settings.sfxVolume);
        haptics.setEnabled(profiles.activeProfile.settings.haptics);
      }

      if (!profiles.activeProfile) {
        await showProfileSelect(screen, profiles, music);
        promptedAtLoad = true;
      } else if (!promptedAtLoad) {
        uiIdle(true);
        const choice = await showContinuePrompt(screen, profiles);
        uiIdle(false);
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
          const collectAt = Date.now();
          await showInterrupted(screen, interrupted, interrupted.pendingRun, collectAt);
          const collected = collectPending(interrupted);
          if (collected) awardGoals(interrupted, collected.run, collectAt);
        } else {
          clearPending(interrupted);
        }
        await profiles.save();
      }
      // No-op after the first time; covers installs with no profile at boot.
      if (migrateDeviceRingBest(profiles.activeProfile, storage)) await profiles.save();
      // The main menu is where a downloaded update may apply (ui:idle).
      uiIdle(true);
      const choice: MenuChoice = await showMainMenu(screen, profiles);
      uiIdle(false);
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
        // Android may only background the app: keep the menu alive so
        // it still works when the player comes back.
        continue;
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
        setOrientation('default');
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

    const other = mode === 'half-pipe' ? 'Downhill' : 'Half-pipe';
    hud.switchBtn.textContent = `Switch to ${other}`;
    hud.fellSwitchBtn.textContent = `Ride ${other}`;

    let crashed = false;
    const callout = createCallouts(hud.hud);
    const game = new Game(getStage(canvas), mode, {
      leftStick: () => dpad.left,
      jumpHeld: () => buttons.jumpHeld,
      flipHeld: () => buttons.flipHeld,
      forwardHeld: () => dpad.upHeld,
    }, {
      onHud: (h) => hud.setReadout(h),
      onTrick: (t) => {
        const c = trickCallout(t);
        callout(c);
        const k = c.tone === 'big' ? 'bigTrick' : c.tone === 'trick' ? 'trick' : c.tone === 'sketchy' ? 'sketchy' : 'bail';
        soundFx.play(k);
        haptics.play(k);
      },
      onGrace: (left) => { callout(graceCallout(left)); soundFx.play('grace'); haptics.play('grace'); },
      onComboChange: (count, mult) => {
        if (count <= 0) { hud.comboBar.style.display = 'none'; return; }
        // Each chained trick rings a step higher.
        if (count >= 2) soundFx.play('combo', Math.min(1.8, 1 + 0.08 * (count - 2)));
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
        soundFx.play('crash');
        haptics.play('crash');
        savePending();
        hud.pauseBtn.disabled = true;
        hud.settingsBtn.disabled = true;
        hud.hud.classList.add('run-over');
      },
      onFell: () => showRunSummary('You fell'),
      // A bug inside a frame: end the run cleanly (banked, summary shown)
      // instead of leaving a frozen screen.
      onFault: () => { crashed = true; hud.hud.classList.add('run-over'); showRunSummary('Run ended'); },
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
          // Resume even if the save fails (it's retried by later saves).
          try { await profiles.save(); } finally { if (!finished) game.resume(); }
        });
      }
    }
    // End-to-end test hook (only when the page URL carries ?e2e).
    if (location.search.includes('e2e')) (window as unknown as { __wtb?: unknown }).__wtb = { game, sfx: soundFx, haptics };

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

    // Held controls are released whenever the run stops taking input,
    // so a release that never arrived can't leave a button stuck.
    const releaseControls = () => { dpad.reset(); buttons.reset(); };
    const openPause = () => {
      if (crashed || finished) return;
      savePending();
      releaseControls();
      game.pause();
      hud.pauseMenu.style.display = 'flex';
    };
    const closePause = () => {
      hud.pauseMenu.style.display = 'none';
      releaseControls();
      game.resume();
    };
    const isShown = (el: HTMLElement) => el.style.display === 'flex';
    const anyOverlay = () => isShown(hud.pauseMenu) || isShown(hud.settingsOverlay) || isShown(hud.halfpipeIntro) || isShown(hud.fellOverlay);

    // Backgrounding the app (or losing focus) pauses the run and saves
    // the mirror.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        savePending();
        releaseControls();
        if (!anyOverlay()) openPause();
      }
    };
    const onBlur = () => { releaseControls(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', savePending);

    // Android Back: an open sub-panel (Settings, Upgrades, About, the
    // half-pipe card) takes its own Back; the fell screen goes to the
    // menu; otherwise Back toggles the pause menu.
    const popBack = pushBackHandler(() => {
      if (finished) return false;
      if (isShown(hud.settingsOverlay) || isShown(hud.halfpipeIntro)) return clickScreenBack(hud.hud) || true;
      if (isShown(hud.fellOverlay)) { finish(null); return true; }
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
      const summary = buildRunSummary(stats, banked, active.stats, goalLines(goalAwards));
      hud.fellStats.innerHTML = runSummaryHtml(summary);
      if (summary.anyNewBest) soundFx.play('newBest');
      else if (goalAwards.length) soundFx.play('goal');
      hud.pauseMenu.style.display = 'none';
      hud.fellOverlay.style.display = 'flex';
    };

    let finished = false;
    const finish = (next: RunNext) => {
      if (finished) return;
      finished = true;
      clearInterval(pendingTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
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

    // The HUD gear: Settings over the live run, which is paused while it
    // is open and resumes only if it was riding before.
    hud.settingsBtn.addEventListener('click', async () => {
      if (crashed || finished || anyOverlay()) return;
      savePending();
      releaseControls();
      game.pause();
      hud.settingsOverlay.style.display = 'flex';
      await showSettings(hud.settingsOverlay, music, profiles);
      hud.settingsOverlay.style.display = 'none';
      hud.settingsOverlay.innerHTML = '';
      if (!finished && !crashed) game.resume();
    });
    // Ending a run any way (Quit, or switching style) shows what it
    // earned first; the summary's own buttons go on from there.
    const endRun = () => {
      if (crashed || finished) return;
      crashed = true;
      hud.hud.classList.add('run-over');
      showRunSummary('Run over');
    };
    hud.switchBtn.addEventListener('click', endRun);
    hud.quitBtn.addEventListener('click', endRun);
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

bootstrap().catch((err) => showFatalError('bootstrap', err));
