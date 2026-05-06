import { showAbout } from './About';

// Single-purpose settings shell today: just routes to the About panel.
// Wrapped as a separate screen so future settings (sound, controls,
// reset save) can land alongside without changing every menu's wiring.
export function showSettings(root: HTMLElement): Promise<void> {
  return new Promise<void>((resolve) => {
    const render = () => {
      root.innerHTML = `
        <div class="fullscreen-panel">
          <h1>Settings</h1>
          <div class="list">
            <button id="settings-about">About / Build info</button>
            <button id="settings-back">Back</button>
          </div>
        </div>
      `;
      root.querySelector<HTMLButtonElement>('#settings-about')!.addEventListener('click', async () => {
        await showAbout(root);
        render();
      });
      root.querySelector<HTMLButtonElement>('#settings-back')!.addEventListener('click', () => resolve());
    };
    render();
  });
}
