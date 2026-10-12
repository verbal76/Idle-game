import type { InputSource } from './hub';
import type { PadFamily } from './gamepad';

/** What the on-screen button prompts look like. 'touch' shows none. */
export type PromptStyle = 'touch' | 'keyboard' | 'xbox' | 'playstation' | 'switch' | 'steamdeck';
export type PromptPref = 'auto' | Exclude<PromptStyle, 'touch'>;
export const PROMPT_PREFS: readonly PromptPref[] = ['auto', 'xbox', 'playstation', 'switch', 'steamdeck', 'keyboard'];
export const PROMPT_PREF_LABEL: Record<PromptPref, string> = {
  auto: 'Auto', xbox: 'Xbox', playstation: 'PlayStation', switch: 'Switch', steamdeck: 'Steam Deck', keyboard: 'Keyboard',
};

/** After the prompts change source they hold for this long, so touching the screen while a button is pressed can't flicker them. */
export const PROMPT_DWELL_MS = 700;

/**
 * Which prompt family to show. The source is whichever device was last
 * *deliberately* used (a press, a key, a tap; stick drift and mouse movement
 * do not count), with a short dwell after each switch.
 */
export class PromptState {
  private src: InputSource;
  private fam: PadFamily = 'generic';
  private switchedAt = -Infinity;
  pref: PromptPref = 'auto';

  constructor(private readonly now: () => number, initial: InputSource = 'touch', private readonly dwellMs = PROMPT_DWELL_MS) {
    this.src = initial;
  }

  get source(): InputSource { return this.src; }

  noteActivity(source: InputSource): void {
    if (source === this.src) return;
    if (this.now() - this.switchedAt < this.dwellMs) return;
    this.src = source;
    this.switchedAt = this.now();
  }

  setFamily(f: PadFamily): void { this.fam = f; }
  /** Pad gone: fall back to keyboard (desktop) or touch. */
  padLost(fallback: InputSource): void {
    if (this.src === 'gamepad') { this.src = fallback; this.switchedAt = this.now(); }
  }

  get style(): PromptStyle {
    if (this.src === 'touch') return 'touch';
    if (this.pref !== 'auto') return this.pref;
    if (this.src === 'keyboard') return 'keyboard';
    return this.fam === 'generic' ? 'xbox' : this.fam;
  }
}

// ---- glyph artwork (owner-supplied pack, src/assets/glyphs, unmodified) ----

const files = import.meta.glob('../assets/glyphs/*/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Folder of artwork for a style: the pack has no Steam Deck set, so the Deck shows the Xbox-layout face buttons. */
export const artFamily = (s: Exclude<PromptStyle, 'touch'>): 'xbox' | 'playstation' | 'switch' | 'keyboard' =>
  s === 'steamdeck' ? 'xbox' : s;

export function glyphUrl(family: string, slot: string): string | null {
  return files[`../assets/glyphs/${family}/${slot}.png`] ?? null;
}

/** Xbox "Menu" exists only in the pack's sprite sheet (cell at 0,1680 in a 632x1808 sheet). */
export const SPRITE = { w: 632, h: 1808, menuX: 0, menuY: 1680, cell: 128 };

export type Glyph = { kind: 'img'; url: string; slot: string } | { kind: 'sprite'; url: string; slot: string } | { kind: 'text'; text: string; slot: string };
export interface PromptEntry { glyphs: Glyph[]; label: string }
export type PromptContext = 'menu' | 'adjust' | 'play' | 'none';

function g(family: 'xbox' | 'playstation' | 'switch' | 'keyboard', slot: string): Glyph {
  if (family === 'xbox' && slot === 'start') {
    const url = glyphUrl('xbox', 'sprite');
    if (url) return { kind: 'sprite', url, slot };
  }
  const url = glyphUrl(family, slot);
  return url ? { kind: 'img', url, slot } : { kind: 'text', text: slot, slot };
}

/** Buttons per action, per style. The same physical positions in every family. */
export function promptEntries(style: PromptStyle, ctx: PromptContext): PromptEntry[] {
  if (style === 'touch' || ctx === 'none') return [];
  const f = artFamily(style);
  if (f === 'keyboard') {
    if (ctx === 'play') return [
      { glyphs: [g(f, 'left'), g(f, 'right')], label: 'Steer' },
      { glyphs: [g(f, 'space')], label: 'Jump' },
      { glyphs: [g(f, 'f')], label: 'Flip' },
      { glyphs: [g(f, 'shift')], label: 'Carve' },
      { glyphs: [g(f, 'esc')], label: 'Pause' },
    ];
    return [
      { glyphs: [g(f, 'up'), g(f, 'down')], label: ctx === 'adjust' ? 'Move' : 'Move' },
      ...(ctx === 'adjust' ? [{ glyphs: [g(f, 'left'), g(f, 'right')], label: 'Adjust' }] : []),
      { glyphs: [g(f, 'enter')], label: 'Select' },
      { glyphs: [g(f, 'esc')], label: 'Back' },
    ];
  }
  if (ctx === 'play') return [
    { glyphs: [g(f, 'stick-l')], label: 'Steer' },
    { glyphs: [g(f, 'south')], label: 'Jump' },
    { glyphs: [g(f, 'west')], label: 'Flip' },
    { glyphs: [g(f, 'lb')], label: 'Carve' },
    { glyphs: [g(f, 'start')], label: 'Pause' },
  ];
  return [
    { glyphs: [g(f, 'dpad')], label: 'Move' },
    ...(ctx === 'adjust' ? [{ glyphs: [g(f, 'dpad-left'), g(f, 'dpad-right')], label: 'Adjust' }] : []),
    { glyphs: [g(f, 'south')], label: 'Select' },
    { glyphs: [g(f, 'east')], label: 'Back' },
  ];
}

/** A stable string for "would the bar look different?": re-render only when it changes. */
export const promptKey = (style: PromptStyle, ctx: PromptContext): string => `${style}|${ctx}`;

// ---- stored choice (device preference, not a profile save) ----

const PREF_KEY = 'wtb.promptStyle';
export function loadPref(storage?: Pick<Storage, 'getItem'>): PromptPref {
  try {
    const v = (storage ?? window.localStorage).getItem(PREF_KEY);
    return (PROMPT_PREFS as readonly string[]).includes(v ?? '') ? (v as PromptPref) : 'auto';
  } catch { return 'auto'; }
}
export function savePref(p: PromptPref, storage?: Pick<Storage, 'setItem'>): void {
  try { (storage ?? window.localStorage).setItem(PREF_KEY, p); } catch { /* storage refused: the choice lasts this session */ }
}
