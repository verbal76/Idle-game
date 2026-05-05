import './style.css';
import { IndexedDbStore } from './profiles/IndexedDbStore';
import { ProfileService } from './profiles/ProfileService';
import { showProfileSelect } from './ui/ProfileSelect';
import { showMainMenu, MenuChoice } from './ui/MainMenu';
import { showUpgrades } from './ui/Upgrades';
import { buildHUD } from './ui/HUD';
import { ArrowPadInput } from './input/ArrowPadInput';
import { ActionButtons } from './input/ActionButtons';
import { Game, DebugSnapshot, DebugFlag } from './scene/Game';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (data: string) => void };
  }
}

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
    const dpad = new ArrowPadInput(hud.leftBtn, hud.rightBtn);
    const buttons = new ActionButtons(hud.jumpBtn, hud.flipBtn);
    const upgrades = profiles.activeProfile!.upgrades ?? { speed: 0, jump: 0, magnet: 0 };

    let debugFrozen = false;
    const game = new Game(canvas, mode, {
      leftStick: () => dpad.left,
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
      onDebugTick: (snap) => {
        if (debugFrozen) return;
        if (hud.debugOverlay.style.display === 'none') return;
        hud.debugReadout.textContent = formatDebugSnapshot(snap);
      },
    }, upgrades);
    game.start();

    const flagBtnPairs: Array<[HTMLButtonElement, DebugFlag]> = [
      [hud.debugWireBtn,      'wireGround'],
      [hud.debugHideSkyBtn,   'hideSky'],
      [hud.debugHideTrailBtn, 'hideTrail'],
      [hud.debugHideDustBtn,  'hideDust'],
      [hud.debugUnlitBtn,     'forceUnlit'],
    ];
    for (const [btn, flag] of flagBtnPairs) {
      btn.addEventListener('click', () => {
        const on = !btn.classList.contains('pressed');
        btn.classList.toggle('pressed', on);
        game.setDebugFlag(flag, on);
      });
    }
    hud.debugFreezeBtn.addEventListener('click', () => {
      debugFrozen = !debugFrozen;
      hud.debugFreezeBtn.classList.toggle('pressed', debugFrozen);
    });
    hud.debugCloseBtn.addEventListener('click', () => {
      hud.debugOverlay.style.display = 'none';
    });

    // Two-finger long-press anywhere reveals the debug overlay.
    // The HUD layer (#hud) overlays the canvas with pointer-events: auto,
    // so touches never reach the canvas — bind on window instead, which
    // receives every touch event via bubbling regardless of target.
    let twoFingerTimer: number | null = null;
    const cancelTwoFinger = () => {
      if (twoFingerTimer !== null) { clearTimeout(twoFingerTimer); twoFingerTimer = null; }
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2 && twoFingerTimer === null) {
        twoFingerTimer = window.setTimeout(() => {
          hud.debugOverlay.style.display = 'flex';
          twoFingerTimer = null;
        }, 600);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) cancelTwoFinger();
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', cancelTwoFinger, { passive: true });
    window.addEventListener('touchcancel', cancelTwoFinger, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });

    const finish = () => {
      game.dispose();
      dpad.detach();
      buttons.detach();
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', cancelTwoFinger);
      window.removeEventListener('touchcancel', cancelTwoFinger);
      window.removeEventListener('touchmove', onTouchMove);
      cancelTwoFinger();
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

function formatDebugSnapshot(s: DebugSnapshot): string {
  const f1 = (n: number) => n.toFixed(1);
  const f2 = (n: number) => n.toFixed(2);
  const f3 = (n: number) => n.toFixed(3);
  const v3 = (a: [number, number, number], dp: 1 | 2 = 1) =>
    `${(dp === 1 ? f1 : f2)(a[0])} ${(dp === 1 ? f1 : f2)(a[1])} ${(dp === 1 ? f1 : f2)(a[2])}`;
  const r = s.rider;
  const c = s.camera;
  const sc = s.scene;
  const m = s.snowMat;
  const lights = s.lights;
  const nc = s.nearestChunk;

  const lines: string[] = [];
  lines.push(`fps ${f1(s.fps)}  am ${sc.activeMeshes}`);
  lines.push(`rdr ${f1(r.x)} ${f1(r.y)} ${f1(r.z)}`);
  lines.push(`hdg ${f2(r.heading)} spd ${f1(r.speed)} g=${r.grounded ? 1 : 0}`);
  lines.push(`surY ${f1(s.surfaceY)} dY ${f1(r.y - s.surfaceY)}`);
  lines.push(`cam ${f1(c.x)} ${f1(c.y)} ${f1(c.z)}`);
  lines.push(`nrZ ${f2(c.minZ)} fZ ${f1(c.maxZ)}`);
  lines.push(`fog ${sc.fogEnabled ? 'ON' : 'off'} m${sc.fogMode} d=${f3(sc.fogDensity)}`);
  lines.push(`fogC ${v3(sc.fogColor, 2)}`);
  lines.push(`clr  ${v3(sc.clearColor, 2)}`);
  if (nc) {
    lines.push(`-- ${nc.name}`);
    lines.push(`vis=${nc.isVisible ? 1 : 0} en=${nc.isEnabled ? 1 : 0} v=${nc.vertexCount}`);
    lines.push(`mat ${nc.materialId}${nc.materialIsSnowMat ? ' snow' : ' !!'}`);
    lines.push(`grp ${nc.renderingGroupId} ai ${nc.alphaIndex}`);
    lines.push(`wmin ${v3(nc.boundsWorldMin)}`);
    lines.push(`wmax ${v3(nc.boundsWorldMax)}`);
    lines.push(`dist ${f1(nc.distFromCamera)}`);
  } else {
    lines.push(`-- no chunks`);
  }
  lines.push(`mat wf=${m.wireframe ? 1 : 0} a=${f2(m.alpha)} bfc=${m.backFaceCulling ? 1 : 0}`);
  lines.push(`unlit=${m.disableLighting ? 1 : 0} dR=${f2(m.diffuseR)} eR=${f2(m.emissiveR)}`);
  if (s.sky) {
    lines.push(`sky ${s.sky.isEnabled ? 'ON' : 'off'} p=${s.sky.parentName ?? '-'}`);
    lines.push(`     ${f1(s.sky.x)} ${f1(s.sky.y)} ${f1(s.sky.z)}`);
  }
  lines.push(`lit ${lights.count} sun ${v3(lights.sunDir, 2)}`);
  lines.push(`     sI=${f2(lights.sunIntensity)} hI=${f2(lights.hemiIntensity)}`);
  const fl = s.flags;
  lines.push(`flg w${fl.wireGround ? 1 : 0} s${fl.hideSky ? 1 : 0} t${fl.hideTrail ? 1 : 0} d${fl.hideDust ? 1 : 0} u${fl.forceUnlit ? 1 : 0}`);
  return lines.join('\n');
}

bootstrap().catch((err) => showError('bootstrap', err));
