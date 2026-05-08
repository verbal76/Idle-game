export interface HUDRefs {
  hud: HTMLElement;
  score: HTMLElement;
  pauseBtn: HTMLButtonElement;
  settingsBtn: HTMLButtonElement;
  settingsOverlay: HTMLElement;
  leftBtn: HTMLElement;
  rightBtn: HTMLElement;
  upBtn: HTMLElement;
  jumpBtn: HTMLElement;
  flipBtn: HTMLElement;
  comboBar: HTMLElement;
  comboMult: HTMLElement;
  comboCount: HTMLElement;
  ringWidget: HTMLElement;
  ringStreak: HTMLElement;
  ringBest: HTMLElement;
  halfpipeIntro: HTMLElement;
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
        <div class="ring-widget" id="ring-widget" style="display:none">
          <span class="ring-icon">◯</span>
          <span class="ring-streak" id="ring-streak">0</span>
          <span class="ring-best" id="ring-best">best 0</span>
        </div>
        <div class="top-actions">
          <button class="gear-btn" id="hud-settings" aria-label="Settings">⚙</button>
          <button class="pause-btn" id="pause">II</button>
        </div>
      </div>
      <div class="combo-bar" id="combo-bar" style="display:none">
        <span class="combo-mult" id="combo-mult">×1.0</span>
        <span class="combo-count" id="combo-count">1 chain</span>
      </div>
      <div id="halfpipe-intro" class="fullscreen-panel halfpipe-intro" style="display:none">
        <div class="halfpipe-intro-card">
          <h1>Half-pipe</h1>
          <ul class="halfpipe-intro-list">
            <li><span class="hp-icon hp-icon-strip">▮</span> <b>Yellow strips</b> in the trough — speed boost</li>
            <li><span class="hp-icon hp-icon-ring">◯</span> <b>Magenta rings</b> — flip-through bonus + streak (miss one and the streak resets)</li>
            <li><span class="hp-icon">⤺</span> <b>Hit the lip</b> — bounces you back into the bowl</li>
            <li><span class="hp-icon">▲</span> <b>Hold the up arrow</b> — tighter, deeper carve</li>
            <li><span class="hp-icon">+</span> Chain landings within 5 s — combo multiplier</li>
          </ul>
          <p class="halfpipe-intro-hint">Tap to dismiss</p>
        </div>
      </div>
      <div class="dpad-left">
        <button class="dpad-btn up" id="dpad-up" aria-label="Straighten">▲</button>
        <div class="dpad-row">
          <button class="dpad-btn left" id="dpad-left">◀</button>
          <button class="dpad-btn right" id="dpad-right">▶</button>
        </div>
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
    upBtn:           root.querySelector<HTMLElement>('#dpad-up')!,
    jumpBtn:         root.querySelector<HTMLElement>('#jump')!,
    flipBtn:         root.querySelector<HTMLElement>('#flip')!,
    comboBar:        root.querySelector<HTMLElement>('#combo-bar')!,
    comboMult:       root.querySelector<HTMLElement>('#combo-mult')!,
    comboCount:      root.querySelector<HTMLElement>('#combo-count')!,
    ringWidget:      root.querySelector<HTMLElement>('#ring-widget')!,
    ringStreak:      root.querySelector<HTMLElement>('#ring-streak')!,
    ringBest:        root.querySelector<HTMLElement>('#ring-best')!,
    halfpipeIntro:   root.querySelector<HTMLElement>('#halfpipe-intro')!,
    pauseMenu:       root.querySelector<HTMLElement>('#pause-menu')!,
    resumeBtn:       root.querySelector<HTMLButtonElement>('#resume')!,
    switchBtn:       root.querySelector<HTMLButtonElement>('#switch-style')!,
    quitBtn:         root.querySelector<HTMLButtonElement>('#quit')!,
    fellOverlay:     root.querySelector<HTMLElement>('#fell-overlay')!,
    fellStats:       root.querySelector<HTMLElement>('#fell-stats')!,
    fellOkBtn:       root.querySelector<HTMLButtonElement>('#fell-ok')!,
  };
}
