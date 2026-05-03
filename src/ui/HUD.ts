export interface HUDRefs {
  hud: HTMLElement;
  score: HTMLElement;
  pauseBtn: HTMLButtonElement;
  leftStick: HTMLElement;
  rightStick: HTMLElement;
  pauseMenu: HTMLElement;
  resumeBtn: HTMLButtonElement;
  quitBtn: HTMLButtonElement;
}

export function buildHUD(root: HTMLElement): HUDRefs {
  root.innerHTML = `
    <div id="hud">
      <div class="top-bar">
        <span class="score" id="score">0</span>
        <button class="pause-btn" id="pause">II</button>
      </div>
      <div class="stick stick-left"  id="stick-left"><div class="knob"></div></div>
      <div class="stick stick-right" id="stick-right"><div class="knob"></div></div>
      <div id="pause-menu" class="fullscreen-panel" style="display:none">
        <h1>Paused</h1>
        <div class="list">
          <button id="resume">Resume</button>
          <button id="quit" class="danger">Quit run</button>
        </div>
      </div>
    </div>
  `;
  return {
    hud:        root.querySelector<HTMLElement>('#hud')!,
    score:      root.querySelector<HTMLElement>('#score')!,
    pauseBtn:   root.querySelector<HTMLButtonElement>('#pause')!,
    leftStick:  root.querySelector<HTMLElement>('#stick-left')!,
    rightStick: root.querySelector<HTMLElement>('#stick-right')!,
    pauseMenu:  root.querySelector<HTMLElement>('#pause-menu')!,
    resumeBtn:  root.querySelector<HTMLButtonElement>('#resume')!,
    quitBtn:    root.querySelector<HTMLButtonElement>('#quit')!,
  };
}
