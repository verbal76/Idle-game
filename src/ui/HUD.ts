export interface HUDRefs {
  hud: HTMLElement;
  score: HTMLElement;
  pauseBtn: HTMLButtonElement;
  settingsBtn: HTMLButtonElement;
  settingsOverlay: HTMLElement;
  leftBtn: HTMLElement;
  rightBtn: HTMLElement;
  jumpBtn: HTMLElement;
  flipBtn: HTMLElement;
  pauseMenu: HTMLElement;
  resumeBtn: HTMLButtonElement;
  switchBtn: HTMLButtonElement;
  quitBtn: HTMLButtonElement;
  fellOverlay: HTMLElement;
  fellStats: HTMLElement;
  fellOkBtn: HTMLButtonElement;
}

export function buildHUD(root: HTMLElement): HUDRefs {
  root.innerHTML = `
    <div id="hud">
      <div class="top-bar">
        <span class="score" id="score">0 m</span>
        <button class="gear-btn" id="hud-settings" aria-label="Settings">⚙</button>
        <button class="pause-btn" id="pause">II</button>
      </div>
      <div class="dpad-left">
        <button class="dpad-btn left" id="dpad-left">◀</button>
        <button class="dpad-btn right" id="dpad-right">▶</button>
      </div>
      <div class="actions-right">
        <button class="action-btn flip" id="flip">FLIP</button>
        <button class="action-btn jump" id="jump">JUMP</button>
      </div>
      <div id="pause-menu" class="fullscreen-panel" style="display:none">
        <h1>Paused</h1>
        <div class="list">
          <button id="resume">Resume</button>
          <button id="switch-style">Switch Style</button>
          <button id="quit" class="danger">Quit run</button>
        </div>
      </div>
      <div id="settings-overlay" class="fullscreen-panel" style="display:none"></div>
      <div id="fell-overlay" class="fullscreen-panel" style="display:none">
        <h1>You fell</h1>
        <p class="muted" id="fell-stats"></p>
        <div class="list">
          <button id="fell-ok">Continue</button>
        </div>
      </div>
    </div>
  `;
  return {
    hud:             root.querySelector<HTMLElement>('#hud')!,
    score:           root.querySelector<HTMLElement>('#score')!,
    pauseBtn:        root.querySelector<HTMLButtonElement>('#pause')!,
    settingsBtn:     root.querySelector<HTMLButtonElement>('#hud-settings')!,
    settingsOverlay: root.querySelector<HTMLElement>('#settings-overlay')!,
    leftBtn:         root.querySelector<HTMLElement>('#dpad-left')!,
    rightBtn:        root.querySelector<HTMLElement>('#dpad-right')!,
    jumpBtn:         root.querySelector<HTMLElement>('#jump')!,
    flipBtn:         root.querySelector<HTMLElement>('#flip')!,
    pauseMenu:       root.querySelector<HTMLElement>('#pause-menu')!,
    resumeBtn:       root.querySelector<HTMLButtonElement>('#resume')!,
    switchBtn:       root.querySelector<HTMLButtonElement>('#switch-style')!,
    quitBtn:         root.querySelector<HTMLButtonElement>('#quit')!,
    fellOverlay:     root.querySelector<HTMLElement>('#fell-overlay')!,
    fellStats:       root.querySelector<HTMLElement>('#fell-stats')!,
    fellOkBtn:       root.querySelector<HTMLButtonElement>('#fell-ok')!,
  };
}
