import { ProfileService } from '../profiles/ProfileService';
import { bouncyTextHtml } from '../util/bouncyText';
import { escapeHtml } from '../util/escapeHtml';

// Confirmation prompt shown at app load when there's a saved active
// profile. Two paths: continue as the saved profile, or kick straight
// into creating a brand-new profile (whimsical name picker). For
// switching to a DIFFERENT existing profile, the player goes through
// MainMenu → Switch profile, which routes to the full picker. The
// previous version of this prompt routed "Different profile" to the
// picker, which felt weird because the picker re-listed the profile
// the user had just declined to continue as.
export type ContinueChoice = 'continue' | 'new';

export function showContinuePrompt(root: HTMLElement, profiles: ProfileService): Promise<ContinueChoice> {
  return new Promise<ContinueChoice>((resolve) => {
    const p = profiles.activeProfile!;
    const lastPlayed = p.lastPlayedMs ? new Date(p.lastPlayedMs).toLocaleString() : 'unknown';
    root.innerHTML = `
      <div class="fullscreen-panel menu-bg menu-bg-stacked splash-bg">
        <h1 class="title-bouncy">${bouncyTextHtml("Where's the Bottom?")}</h1>
        <p class="muted">Last player: ${escapeHtml(p.name)}</p>
        <p class="muted">Last played: ${escapeHtml(lastPlayed)}</p>
        <div class="list">
          <button id="continue" class="btn-go">Continue as ${escapeHtml(p.name)}</button>
          <button id="new-profile">New Profile</button>
        </div>
      </div>
    `;
    root.querySelector<HTMLButtonElement>('#continue')!.addEventListener('click', () => resolve('continue'));
    root.querySelector<HTMLButtonElement>('#new-profile')!.addEventListener('click', () => resolve('new'));
  });
}
