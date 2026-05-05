export interface HUDRefs {
  hud: HTMLElement;
  score: HTMLElement;
  pauseBtn: HTMLButtonElement;
  leftBtn: HTMLElement;
  rightBtn: HTMLElement;
  jumpBtn: HTMLElement;
  flipBtn: HTMLElement;
  pauseMenu: HTMLElement;
  resumeBtn: HTMLButtonElement;
  quitBtn: HTMLButtonElement;
  fellOverlay: HTMLElement;
  fellStats: HTMLElement;
  fellOkBtn: HTMLButtonElement;
  debugOverlay: HTMLElement;
  debugReadout: HTMLElement;
  debugWireBtn: HTMLButtonElement;
  debugHideSkyBtn: HTMLButtonElement;
  debugHideTrailBtn: HTMLButtonElement;
  debugHideDustBtn: HTMLButtonElement;
  debugUnlitBtn: HTMLButtonElement;
  debugFreezeBtn: HTMLButtonElement;
  debugCloseBtn: HTMLButtonElement;
}

export function buildHUD(root: HTMLElement): HUDRefs {
  root.innerHTML = `
    <div id="hud">
      <div class="top-bar">
        <span class="score" id="score">0 m</span>
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
          <button id="quit" class="danger">Quit run</button>
        </div>
      </div>
      <div id="fell-overlay" class="fullscreen-panel" style="display:none">
        <h1>You fell</h1>
        <p class="muted" id="fell-stats"></p>
        <div class="list">
          <button id="fell-ok">Continue</button>
        </div>
      </div>
      <div id="debug-overlay" class="debug-overlay" style="display:none">
        <div class="debug-head">
          <span>DEBUG</span>
          <button id="debug-close" class="debug-close">×</button>
        </div>
        <pre id="debug-readout" class="debug-readout"></pre>
        <div class="debug-toggles">
          <button id="debug-wire" class="debug-toggle">WIRE</button>
          <button id="debug-hide-sky" class="debug-toggle">NO SKY</button>
          <button id="debug-hide-trail" class="debug-toggle">NO TRAIL</button>
          <button id="debug-hide-dust" class="debug-toggle">NO DUST</button>
          <button id="debug-unlit" class="debug-toggle">UNLIT</button>
          <button id="debug-freeze" class="debug-toggle">FREEZE</button>
        </div>
      </div>
    </div>
  `;
  return {
    hud:         root.querySelector<HTMLElement>('#hud')!,
    score:       root.querySelector<HTMLElement>('#score')!,
    pauseBtn:    root.querySelector<HTMLButtonElement>('#pause')!,
    leftBtn:     root.querySelector<HTMLElement>('#dpad-left')!,
    rightBtn:    root.querySelector<HTMLElement>('#dpad-right')!,
    jumpBtn:     root.querySelector<HTMLElement>('#jump')!,
    flipBtn:     root.querySelector<HTMLElement>('#flip')!,
    pauseMenu:   root.querySelector<HTMLElement>('#pause-menu')!,
    resumeBtn:   root.querySelector<HTMLButtonElement>('#resume')!,
    quitBtn:     root.querySelector<HTMLButtonElement>('#quit')!,
    fellOverlay: root.querySelector<HTMLElement>('#fell-overlay')!,
    fellStats:   root.querySelector<HTMLElement>('#fell-stats')!,
    fellOkBtn:   root.querySelector<HTMLButtonElement>('#fell-ok')!,
    debugOverlay:      root.querySelector<HTMLElement>('#debug-overlay')!,
    debugReadout:      root.querySelector<HTMLElement>('#debug-readout')!,
    debugWireBtn:      root.querySelector<HTMLButtonElement>('#debug-wire')!,
    debugHideSkyBtn:   root.querySelector<HTMLButtonElement>('#debug-hide-sky')!,
    debugHideTrailBtn: root.querySelector<HTMLButtonElement>('#debug-hide-trail')!,
    debugHideDustBtn:  root.querySelector<HTMLButtonElement>('#debug-hide-dust')!,
    debugUnlitBtn:     root.querySelector<HTMLButtonElement>('#debug-unlit')!,
    debugFreezeBtn:    root.querySelector<HTMLButtonElement>('#debug-freeze')!,
    debugCloseBtn:     root.querySelector<HTMLButtonElement>('#debug-close')!,
  };
}
