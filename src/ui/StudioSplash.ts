/**
 * The Hot Attic Games opening card: solid black, the canonical logo
 * (branding/Hot_Attic_Games_Master_Logo.png) centred and contained at its
 * own aspect ratio, about 1.5 s, silent. It sits ON TOP of the normal
 * start-up, which keeps loading underneath; the game's own splash and menus
 * follow it. Shown once per page load (a genuine launch, or a restart into
 * an update), never on ordinary navigation.
 *
 * The logo is picked up at build time when the file exists. Without it
 * nothing is shown and nothing breaks: no substitute is ever drawn.
 */
export const STUDIO_SPLASH_MS = 1500;
const FADE_MS = 200;
const BACKSTOP_MS = 4000;       // a stalled decode can't keep it up

const logos = import.meta.glob('../../branding/Hot_Attic_Games_Master_Logo.png', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;

export function studioLogoUrl(): string | null {
  const first = Object.values(logos)[0];
  return typeof first === 'string' && first ? first : null;
}

let shownThisLoad = false;
/** Test hook: forget that the card was shown. */
export function resetStudioSplash(): void { shownThisLoad = false; }

export interface SplashOptions {
  logoUrl?: string | null;
  durationMs?: number;
  doc?: Document;
}

/** Shows the card; returns its element, or null when there is no logo or it was already shown. */
export function showStudioSplash(opts: SplashOptions = {}): HTMLElement | null {
  const url = opts.logoUrl === undefined ? studioLogoUrl() : opts.logoUrl;
  if (!url || shownThisLoad) return null;
  shownThisLoad = true;
  const doc = opts.doc ?? document;
  const duration = opts.durationMs ?? STUDIO_SPLASH_MS;
  const el = doc.createElement('div');
  el.id = 'studio-splash';
  el.className = 'studio-splash';
  el.setAttribute('aria-hidden', 'true');
  const img = doc.createElement('img');
  img.alt = 'Hot Attic Games';
  img.draggable = false;
  el.appendChild(img);
  let gone = false;
  const remove = () => {
    if (gone) return;
    gone = true;
    el.classList.add('out');
    setTimeout(() => el.remove(), FADE_MS);
  };
  // The 1.5 s runs from the moment the logo is actually visible.
  img.addEventListener('load', () => { setTimeout(remove, duration); });
  img.addEventListener('error', remove);
  setTimeout(remove, duration + BACKSTOP_MS);
  img.src = url;
  doc.body.appendChild(el);
  return el;
}
