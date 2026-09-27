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
  jumpChargeBar: HTMLElement;
  halfpipeIntro: HTMLElement;
  pauseMenu: HTMLElement;
  resumeBtn: HTMLButtonElement;
  pauseUpgradesBtn: HTMLButtonElement;
  pauseSettingsBtn: HTMLButtonElement;
  pauseHowToBtn: HTMLButtonElement;
  switchBtn: HTMLButtonElement;
  quitBtn: HTMLButtonElement;
  fellOverlay: HTMLElement;
  fellStats: HTMLElement;
  fellOkBtn: HTMLButtonElement;
  fellUpgradesBtn: HTMLButtonElement;
  fellSwitchBtn: HTMLButtonElement;
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
      <div class="jump-charge-bar" id="jump-charge-bar"></div>
      <div id="halfpipe-intro" class="fullscreen-panel halfpipe-intro" style="display:none">
        <div class="halfpipe-intro-card">
          <h1>Half-pipe</h1>
          <ul class="halfpipe-intro-list">
            <li><span class="hp-icon hp-icon-strip">▮</span> <b>Yellow strips</b> in the trough — speed boost</li>
            <li><span class="hp-icon hp-icon-ring">◯</span> <b>Magenta rings</b> — flip-through bonus + streak (miss one and the streak resets)</li>
            <li><span class="hp-icon">⤺</span> <b>Hit the lip</b> — bounces you back into the bowl</li>
            <li><span class="hp-icon">↷</span> <b>Hold Deep carve</b> (curved arrow) — tighter, deeper carve</li>
            <li><span class="hp-icon">+</span> Chain landings within 5 s — combo multiplier</li>
          </ul>
          <p class="halfpipe-intro-hint">Tap to dismiss</p>
        </div>
      </div>
      <div class="dpad-left">
        <button class="dpad-btn up" id="dpad-up" aria-label="Deep carve">
          <svg class="carve-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 19 C5 10 11 5.5 18 8" />
            <path d="M13.5 4.5 L18.5 8 L13 11" />
          </svg>
          <span class="dpad-caption">CARVE</span>
        </button>
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
          <button id="pause-upgrades">Upgrades 🛍</button>
          <button id="pause-settings">Settings ⚙</button>
          <button id="pause-howto" style="display:none">How to play</button>
          <button id="switch-style">Switch Style</button>
          <button id="quit" class="danger">Quit run</button>
        </div>
      </div>
      <div id="settings-overlay" class="fullscreen-panel" style="display:none"></div>
      <div id="fell-overlay" class="fullscreen-panel" style="display:none">
        <h1>You fell</h1>
        <p class="muted" id="fell-stats"></p>
        <div class="list">
          <button id="fell-ok">Back to menu</button>
          <button id="fell-upgrades">Upgrades 🛍</button>
          <button id="fell-switch">Switch Style</button>
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
    jumpChargeBar:   root.querySelector<HTMLElement>('#jump-charge-bar')!,
    halfpipeIntro:   root.querySelector<HTMLElement>('#halfpipe-intro')!,
    pauseMenu:       root.querySelector<HTMLElement>('#pause-menu')!,
    resumeBtn:       root.querySelector<HTMLButtonElement>('#resume')!,
    pauseUpgradesBtn: root.querySelector<HTMLButtonElement>('#pause-upgrades')!,
    pauseSettingsBtn: root.querySelector<HTMLButtonElement>('#pause-settings')!,
    pauseHowToBtn:   root.querySelector<HTMLButtonElement>('#pause-howto')!,
    switchBtn:       root.querySelector<HTMLButtonElement>('#switch-style')!,
    quitBtn:         root.querySelector<HTMLButtonElement>('#quit')!,
    fellOverlay:     root.querySelector<HTMLElement>('#fell-overlay')!,
    fellStats:       root.querySelector<HTMLElement>('#fell-stats')!,
    fellOkBtn:       root.querySelector<HTMLButtonElement>('#fell-ok')!,
    fellUpgradesBtn: root.querySelector<HTMLButtonElement>('#fell-upgrades')!,
    fellSwitchBtn:   root.querySelector<HTMLButtonElement>('#fell-switch')!,
  };
}

/** Shows the half-pipe how-to card; resolves when the player taps it. */
export function showHalfpipeIntro(hud: HUDRefs): Promise<void> {
  return new Promise((resolve) => {
    hud.halfpipeIntro.style.display = 'flex';
    const dismiss = () => {
      hud.halfpipeIntro.style.display = 'none';
      hud.halfpipeIntro.removeEventListener('click', dismiss);
      resolve();
    };
    hud.halfpipeIntro.addEventListener('click', dismiss);
  });
}
