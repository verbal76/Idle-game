/**
 * The Hot Attic Games opening card: the owner-supplied canonical logo
 * (Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png, repository root, never edited)
 * centred and CONTAINED at its own aspect ratio on the app's
 * own start-up colour, silent: about 0.3 s fade-in, 2.2 s hold, 0.3 s
 * fade-out (about 2.8 s). It sits ON TOP of the normal start-up, which keeps
 * loading underneath (it masks start-up work rather than adding dead time);
 * the game's own splash and menus follow it. Shown once per page load (a
 * genuine launch, or a restart into an update), never on ordinary navigation
 * or on resuming from the background.
 *
 * What the page actually embeds is src/assets/studio-logo.webp: the same
 * pixels at the same 1536x1024 size with alpha, made from the canonical PNG by
 * scripts/make-studio-logo.mjs (0.45 MB instead of 2.8 MB, because the whole
 * game is ONE inline HTML string that fails above ~10 MB on Android). A unit
 * test ties it to the canonical file's SHA-256. If the file is ever missing nothing
 * is shown and nothing breaks: no substitute is ever drawn. A stalled decode
 * cannot keep the card up (backstop), and it never blocks start-up.
 *
 * Studio-wide requirement: docs/studio-splash.md.
 */
export const STUDIO_LOGO_FILE = 'Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png';
export const STUDIO_LOGO_DISPLAY_FILE = 'src/assets/studio-logo.webp';
export const STUDIO_SPLASH_FADE_IN_MS = 300;
export const STUDIO_SPLASH_MS = 2200;                 // hold, from the moment the logo is visible
export const STUDIO_SPLASH_FADE_OUT_MS = 300;
export const STUDIO_SPLASH_TOTAL_MS = STUDIO_SPLASH_FADE_IN_MS + STUDIO_SPLASH_MS + STUDIO_SPLASH_FADE_OUT_MS;
const BACKSTOP_MS = 4000;       // a stalled decode can't keep it up

const logos = import.meta.glob('../assets/studio-logo.webp', {
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
    setTimeout(() => el.remove(), STUDIO_SPLASH_FADE_OUT_MS);
  };
  // The hold runs from the moment the logo is actually visible (it fades in then).
  img.addEventListener('load', () => { el.classList.add('ready'); setTimeout(remove, duration + STUDIO_SPLASH_FADE_IN_MS); });
  img.addEventListener('error', remove);
  setTimeout(remove, duration + BACKSTOP_MS);
  img.src = url;
  doc.body.appendChild(el);
  return el;
}
