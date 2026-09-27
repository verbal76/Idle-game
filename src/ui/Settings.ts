import { MusicPlayer } from '../audio/MusicPlayer';
import { ProfileService } from '../profiles/ProfileService';
import { showAbout } from './About';
import { openBugReport, openFeatureRequest } from '../util/bugReport';
import { escapeHtml } from '../util/escapeHtml';

// State machine for the OTA update flow. Native side posts these via
// CustomEvent('update-status'); the Settings panel listens and updates
// the inline label + button label.
type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'downloading' | 'ready' | 'reloading' | 'unavailable';

declare global {
  interface Window {
    __UPDATE_STATUS__?: UpdateStatus;
    ReactNativeWebView?: { postMessage: (data: string) => void };
  }
}

const STATUS_LABEL: Record<UpdateStatus, string> = {
  idle:           '',
  checking:       'Checking for updates…',
  'up-to-date':   'Up to date',
  downloading:    'Downloading…',
  ready:          'Update ready — restart now',
  reloading:      'Restarting…',
  unavailable:    'Updates unavailable (dev build)',
};

// Single-purpose settings shell: routes to the About panel, holds the
// music volume control, and exposes a manual update check.
export function showSettings(
  root: HTMLElement,
  music: MusicPlayer,
  profiles: ProfileService,
): Promise<void> {
  return new Promise<void>((resolve) => {
    let currentStatus: UpdateStatus = (window.__UPDATE_STATUS__ as UpdateStatus | undefined) ?? 'idle';
    const onUpdateStatus = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail !== 'string') return;
      currentStatus = detail as UpdateStatus;
      paintUpdateRow();
    };
    window.addEventListener('update-status', onUpdateStatus);

    let paintUpdateRow = () => {/* replaced after each render */};

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
            <button id="updates-check">Check for updates</button>
            <p class="muted" id="updates-status"></p>
            <button id="settings-about">About / Build info</button>
            <button id="settings-bug">🐞 Send bug report</button>
            <button id="settings-feature">💡 Send feature request</button>
            <button id="settings-back">Back</button>
          </div>
        </div>
      `;

      const slider = root.querySelector<HTMLInputElement>('#music-vol')!;
      const valLabel = root.querySelector<HTMLElement>('#music-vol-val')!;
      // Debounce the IDB save so a 0→100 slider drag doesn't queue ~60
      // separate transactions on the WebView's IDB worker. Apply the
      // value to the player + profile object instantly (cheap), and
      // persist on idle. A 'change' event flush guarantees we save the
      // final value if the player drags-and-quits before the timer.
      let saveTimer: ReturnType<typeof setTimeout> | null = null;
      const queueSave = () => {
        if (saveTimer !== null) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { saveTimer = null; void profiles.save(); }, 250);
      };
      const flushSave = () => {
        if (saveTimer !== null) { clearTimeout(saveTimer); saveTimer = null; }
        void profiles.save();
      };
      slider.addEventListener('input', () => {
        const v = Number(slider.value) / 100;
        music.setVolume(v);
        valLabel.textContent = `${slider.value}%`;
        if (profile) {
          profile.settings.musicVolume = v;
          queueSave();
        }
      });
      slider.addEventListener('change', flushSave);

      const skipBtn = root.querySelector<HTMLButtonElement>('#music-skip')!;
      const nowLabel = root.querySelector<HTMLElement>('#music-now')!;
      skipBtn.addEventListener('click', () => {
        music.next();
        nowLabel.textContent = `Now playing: ${music.currentTitle()}`;
      });

      const updatesBtn = root.querySelector<HTMLButtonElement>('#updates-check')!;
      const updatesStatus = root.querySelector<HTMLElement>('#updates-status')!;
      paintUpdateRow = () => {
        updatesStatus.textContent = STATUS_LABEL[currentStatus] ?? '';
        if (currentStatus === 'ready') {
          updatesBtn.textContent = 'Restart now';
          updatesBtn.disabled = false;
        } else if (currentStatus === 'checking' || currentStatus === 'downloading' || currentStatus === 'reloading') {
          updatesBtn.textContent = 'Check for updates';
          updatesBtn.disabled = true;
        } else {
          updatesBtn.textContent = 'Check for updates';
          updatesBtn.disabled = false;
        }
      };
      updatesBtn.addEventListener('click', () => {
        if (currentStatus === 'ready') {
          // User explicitly wants to restart now to load the
          // already-downloaded update.
          window.ReactNativeWebView?.postMessage('updates:apply');
          return;
        }
        // Manual fetch via the native bridge. App.tsx posts back
        // 'update-status' CustomEvents that paintUpdateRow renders.
        window.ReactNativeWebView?.postMessage('updates:check');
      });
      paintUpdateRow();

      root.querySelector<HTMLButtonElement>('#settings-about')!.addEventListener('click', async () => {
        await showAbout(root);
        render();
      });
      root.querySelector<HTMLButtonElement>('#settings-bug')!.addEventListener('click', () => {
        openBugReport();
      });
      root.querySelector<HTMLButtonElement>('#settings-feature')!.addEventListener('click', () => {
        openFeatureRequest();
      });
      root.querySelector<HTMLButtonElement>('#settings-back')!.addEventListener('click', () => {
        flushSave();
        window.removeEventListener('update-status', onUpdateStatus);
        resolve();
      });
    };
    render();
  });
}
