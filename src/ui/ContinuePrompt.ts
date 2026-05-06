import { ProfileService } from '../profiles/ProfileService';

// Confirmation prompt shown at app load when there's a saved active
// profile. Lets the player resume the most-recent run with one tap, or
// switch to a different profile. Replaces the silent auto-load that
// gave no signal of which profile was active.
export type ContinueChoice = 'continue' | 'switch';

export function showContinuePrompt(root: HTMLElement, profiles: ProfileService): Promise<ContinueChoice> {
  return new Promise<ContinueChoice>((resolve) => {
    const p = profiles.activeProfile!;
    const lastPlayed = p.lastPlayedMs ? new Date(p.lastPlayedMs).toLocaleString() : 'unknown';
    root.innerHTML = `
      <div class="fullscreen-panel">
        <h1>Idle Boarder</h1>
        <p class="muted">Last player: ${escapeHtml(p.name)}</p>
        <p class="muted">Last played: ${escapeHtml(lastPlayed)}</p>
        <div class="list">
          <button id="continue">Continue as ${escapeHtml(p.name)}</button>
          <button id="switch">Different profile</button>
        </div>
      </div>
    `;
    root.querySelector<HTMLButtonElement>('#continue')!.addEventListener('click', () => resolve('continue'));
    root.querySelector<HTMLButtonElement>('#switch')!.addEventListener('click', () => resolve('switch'));
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
  )[ch]!);
}
