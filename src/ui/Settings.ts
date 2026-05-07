import { MusicPlayer } from '../audio/MusicPlayer';
import { ProfileService } from '../profiles/ProfileService';
import { showAbout } from './About';

// Single-purpose settings shell today: routes to the About panel and
// holds the music volume control. Wrapped as a separate screen so
// future settings (sfx, controls, reset save) can land alongside
// without changing every menu's wiring.
export function showSettings(
  root: HTMLElement,
  music: MusicPlayer,
  profiles: ProfileService,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const render = () => {
      const profile = profiles.activeProfile;
      const initialVol = Math.round(music.getVolume() * 100);
      root.innerHTML = `
        <div class="fullscreen-panel">
          <h1>Settings</h1>
          <div class="setting-row">
            <label for="music-vol" class="setting-label">Music volume</label>
            <input type="range" id="music-vol" min="0" max="100" value="${initialVol}" />
            <span class="setting-val" id="music-vol-val">${initialVol}%</span>
          </div>
          <p class="muted" id="music-now">Now playing: ${escapeHtml(music.currentTitle())}</p>
          <div class="list">
            <button id="music-skip">Skip track</button>
            <button id="settings-about">About / Build info</button>
            <button id="settings-back">Back</button>
          </div>
        </div>
      `;

      const slider = root.querySelector<HTMLInputElement>('#music-vol')!;
      const valLabel = root.querySelector<HTMLElement>('#music-vol-val')!;
      slider.addEventListener('input', () => {
        const v = Number(slider.value) / 100;
        music.setVolume(v);
        valLabel.textContent = `${slider.value}%`;
        if (profile) {
          profile.settings.musicVolume = v;
          // Save is fire-and-forget — IndexedDB writes are fast and a
          // failed write isn't worth blocking the slider drag for.
          void profiles.save();
        }
      });

      const skipBtn = root.querySelector<HTMLButtonElement>('#music-skip')!;
      const nowLabel = root.querySelector<HTMLElement>('#music-now')!;
      skipBtn.addEventListener('click', () => {
        music.next();
        // Title flips after the audio element loads the next src; the
        // currentTitle() lookup is synchronous on the playlist index so
        // it's already accurate by the time this runs.
        nowLabel.textContent = `Now playing: ${music.currentTitle()}`;
      });

      root.querySelector<HTMLButtonElement>('#settings-about')!.addEventListener('click', async () => {
        await showAbout(root);
        render();
      });
      root.querySelector<HTMLButtonElement>('#settings-back')!.addEventListener('click', () => resolve());
    };
    render();
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
  )[ch]!);
}
