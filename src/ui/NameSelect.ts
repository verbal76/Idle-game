import { ICON_DICE, ICON_TYPE } from './icons';
import { generateWhimsicalName } from '../util/whimsicalNames';
import { escapeHtml } from '../util/escapeHtml';

// Custom name picker for new profiles. Replaces the bare prompt('Profile
// name?') with a panel that:
//   - Suggests a random whimsical adjective+noun pair (e.g. "Stinky Donut")
//   - Lets the player Reroll for a different suggestion without losing
//     access to the input
//   - Has a Custom toggle for typing a name from scratch
// Resolves with the chosen name (trimmed, non-empty) or null on cancel.


export function showNameSelect(root: HTMLElement): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    let name = generateWhimsicalName();
    let custom = false;

    const render = (): void => {
      const safeName = escapeHtml(name);
      root.innerHTML = `
        <div class="fullscreen-panel name-select">
          <h1>Name your boarder</h1>
          ${custom
            ? `<input type="text" class="name-input" id="name-input" value="${safeName}" maxlength="32" />`
            : `<div class="name-suggested" id="name-display">${safeName}</div>`
          }
          <div class="row">
            ${custom
              ? `<button id="random-mode">${ICON_DICE}Random</button>`
              : `<button id="reroll">${ICON_DICE}Reroll</button><button id="custom-mode">${ICON_TYPE}Type</button>`
            }
          </div>
          <div class="row">
            <button id="cancel" data-back>Cancel</button>
            <button id="confirm" class="primary">Use this</button>
          </div>
        </div>
      `;

      if (custom) {
        const input = root.querySelector<HTMLInputElement>('#name-input')!;
        input.focus();
        input.select();
        input.addEventListener('input', () => { name = input.value; });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') confirm();
        });
        root.querySelector<HTMLButtonElement>('#random-mode')!.addEventListener('click', () => {
          custom = false;
          name = generateWhimsicalName();
          render();
        });
      } else {
        root.querySelector<HTMLButtonElement>('#reroll')!.addEventListener('click', () => {
          name = generateWhimsicalName();
          render();
        });
        root.querySelector<HTMLButtonElement>('#custom-mode')!.addEventListener('click', () => {
          custom = true;
          render();
        });
      }

      const confirm = (): void => {
        const trimmed = name.trim();
        if (!trimmed) return;
        resolve(trimmed);
      };
      root.querySelector<HTMLButtonElement>('#confirm')!.addEventListener('click', confirm);
      root.querySelector<HTMLButtonElement>('#cancel')!.addEventListener('click', () => resolve(null));
    };

    render();
  });
}
