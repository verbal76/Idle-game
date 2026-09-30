import type { HudReadout } from '../scene/Game';
import { ICON_ALT, ICON_FLAKE, ICON_LEFT, ICON_RIGHT } from './icons';
export interface HUDRefs {
  hud: HTMLElement;
  score: HTMLElement;
  // Updates the distance / altitude / snowflakes / tricks chips.
  setReadout: (h: HudReadout) => void;
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
  fellTitle: HTMLElement;
  fellStats: HTMLElement;
  fellOkBtn: HTMLButtonElement;
  fellUpgradesBtn: HTMLButtonElement;
  fellSwitchBtn: HTMLButtonElement;
}

export function buildHUD(root: HTMLElement): HUDRefs {
  root.innerHTML = `
    <div id="hud">
      <div class="top-bar">
        <div class="hud-chips" id="score">
          <span class="chip chip-dist"><b id="chip-dist">0</b><small>m</small></span>
          <span class="chip chip-alt" id="chip-alt-wrap" style="display:none"><span class="chip-icon">${ICON_ALT}</span><b id="chip-alt">0</b><small>m</small></span>
          <span class="chip chip-flakes"><span class="chip-icon">${ICON_FLAKE}</span><b id="chip-flakes">0</b></span>
          <span class="chip chip-tricks" id="chip-tricks-wrap" style="display:none"><span class="chip-icon">↻</span><b id="chip-flips">0</b><span class="chip-icon">⟲</span><b id="chip-spins">0</b></span>
        </div>
        <div class="ring-widget" id="ring-widget" style="display:none">
          <span class="ring-icon">◯</span>
          <span class="ring-streak" id="ring-streak">0</span>
          <span class="ring-best" id="ring-best">best 0</span>
        </div>
        <div class="top-actions">
          <button class="gear-btn" id="hud-settings" aria-label="Settings"><span class="settings-gear" aria-hidden="true"></span></button>
          <button class="pause-btn" id="pause" aria-label="Pause">
            <svg class="pause-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.4" /><rect x="13.8" y="5" width="4.2" height="14" rx="1.4" /></svg>
          </button>
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
            <li><span class="hp-icon hp-icon-strip">▮</span><span class="hp-text"><b>Yellow strips</b> in the trough — speed boost</span></li>
            <li><span class="hp-icon hp-icon-ring">◯</span><span class="hp-text"><b>Magenta rings</b> — flip-through bonus + streak (miss one and the streak resets)</span></li>
            <li><span class="hp-icon">⤺</span><span class="hp-text"><b>Hit the lip</b> — bounces you back into the bowl</span></li>
            <li><span class="hp-icon">↷</span><span class="hp-text"><b>Hold Deep carve</b> (curved arrow) — tighter, deeper carve</span></li>
            <li><span class="hp-icon">↻</span><span class="hp-text"><b>FLIP</b> = front flip, <b>FLIP + Deep carve</b> = back flip (+25%)</span></li>
            <li><span class="hp-icon">⟲</span><span class="hp-text">Steer in the air to spin; land within 30° — backward rides switch (+50% spin)</span></li>
            <li><span class="hp-icon">✦</span><span class="hp-text">Flip + spin in one jump = <b>cork</b> (×1.5)</span></li>
            <li><span class="hp-icon">+</span><span class="hp-text">Chain landings within 5 s — combo multiplier</span></li>
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
          <button class="dpad-btn left" id="dpad-left" aria-label="Steer left">${ICON_LEFT}</button>
          <button class="dpad-btn right" id="dpad-right" aria-label="Steer right">${ICON_RIGHT}</button>
        </div>
      </div>
      <div class="actions-right">
        <button class="action-btn flip" id="flip"><span>FLIP</span></button>
        <button class="action-btn jump" id="jump"><span>JUMP</span></button>
      </div>
      <div id="pause-menu" class="fullscreen-panel" style="display:none">
        <h1>Paused</h1>
        <div class="list">
          <button id="resume" class="btn-go">Resume</button>
          <button id="pause-upgrades" class="btn-accent">Upgrades</button>
          <button id="pause-settings">Settings <span class="settings-gear inline" aria-hidden="true"></span></button>
          <button id="pause-howto" style="display:none">How to play</button>
          <button id="switch-style">Switch Style</button>
          <button id="quit" class="danger">Quit run</button>
        </div>
      </div>
      <div id="settings-overlay" class="fullscreen-panel" style="display:none"></div>
      <div id="fell-overlay" class="fullscreen-panel" style="display:none">
        <h1 id="fell-title">You fell</h1>
        <div id="fell-stats"></div>
        <div class="list">
          <button id="fell-ok" class="btn-go">Back to menu</button>
          <button id="fell-upgrades" class="btn-accent">Upgrades</button>
          <button id="fell-switch">Switch Style</button>
        </div>
      </div>
    </div>
  `;
  return {
    hud:             root.querySelector<HTMLElement>('#hud')!,
    score:           root.querySelector<HTMLElement>('#score')!,
    setReadout:      makeReadout(root),
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
    fellTitle:       root.querySelector<HTMLElement>('#fell-title')!,
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

// Separate chips instead of one run-on string; each DOM write only
// happens when that chip's text actually changes.
function makeReadout(root: HTMLElement): (h: HudReadout) => void {
  const q = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const el = {
    dist: q('chip-dist'), alt: q('chip-alt'), altWrap: q('chip-alt-wrap'),
    flakes: q('chip-flakes'), flips: q('chip-flips'), spins: q('chip-spins'), tricksWrap: q('chip-tricks-wrap'),
  };
  const last = new Map<HTMLElement, string>();
  const put = (e: HTMLElement, v: string) => { if (last.get(e) !== v) { last.set(e, v); e.textContent = v; } };
  const vis = new Map<HTMLElement, boolean>();
  const display = (e: HTMLElement, on: boolean) => { if (vis.get(e) !== on) { vis.set(e, on); e.style.display = on ? '' : 'none'; } };
  return (h) => {
    put(el.dist, String(h.meters));
    display(el.altWrap, h.altitude !== null);
    if (h.altitude !== null) put(el.alt, String(h.altitude));
    put(el.flakes, h.flakes.toLocaleString('en-US'));
    display(el.tricksWrap, h.flips + h.spins > 0);
    put(el.flips, String(h.flips));
    put(el.spins, String(h.spins));
  };
}
