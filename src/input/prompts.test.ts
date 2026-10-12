import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROMPT_DWELL_MS, PROMPT_PREFS, PromptState, artFamily, glyphUrl, loadPref, promptEntries, promptKey, savePref, SPRITE, type PromptContext, type PromptStyle } from './prompts';
import { promptBarHtml } from './promptBar';

const GLYPH_DIR = resolve(__dirname, '../assets/glyphs');
const manifest = JSON.parse(readFileSync(resolve(GLYPH_DIR, 'glyphs.json'), 'utf8')) as {
  archiveSha256: string; modified: boolean; licenseEvidence: string; files: Array<{ file: string; source: string; sha256: string }>;
};

describe('glyph artwork is the owner’s pack, unmodified', () => {
  it('every shipped file matches its recorded SHA-256, and the pack is marked unmodified', () => {
    expect(manifest.modified).toBe(false);
    expect(manifest.archiveSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.files.length).toBeGreaterThan(40);
    for (const f of manifest.files) {
      const sha = createHash('sha256').update(readFileSync(resolve(GLYPH_DIR, f.file))).digest('hex');
      expect(sha, f.file).toBe(f.sha256);
      expect(f.source).toMatch(/\.png$/);
    }
  });
  it('the license note does not overclaim: it names the evidence and the open confirmation', () => {
    expect(manifest.licenseEvidence).toMatch(/screenshot/i);
    expect(manifest.licenseEvidence).toMatch(/confirm/i);
    expect(manifest.licenseEvidence).toMatch(/no license file/i);
  });
  it('the sprite crop for the Xbox Menu glyph lies inside the sheet', () => {
    const png = readFileSync(resolve(GLYPH_DIR, 'xbox/sprite.png'));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([SPRITE.w, SPRITE.h]);
    expect(SPRITE.menuY + SPRITE.cell).toBeLessThanOrEqual(SPRITE.h);
  });
});

const STYLES: Array<Exclude<PromptStyle, 'touch'>> = ['xbox', 'playstation', 'switch', 'steamdeck', 'keyboard'];
const CONTEXTS: PromptContext[] = ['menu', 'adjust', 'play'];

describe('prompts show the right family artwork', () => {
  it('every glyph in every style and context resolves to a real file (never a text fallback)', () => {
    for (const s of STYLES) for (const c of CONTEXTS) {
      const entries = promptEntries(s, c);
      expect(entries.length, `${s}/${c}`).toBeGreaterThan(0);
      for (const e of entries) for (const g of e.glyphs) expect(g.kind, `${s}/${c}/${g.slot}`).not.toBe('text');
    }
  });
  it('the same action is the same physical position in every family, with that family’s own art', () => {
    const jump = (s: PromptStyle) => promptEntries(s, 'play').find((e) => e.label === 'Jump')!.glyphs[0];
    const x = jump('xbox'), p = jump('playstation'), n = jump('switch'), k = jump('keyboard');
    expect([x.slot, p.slot, n.slot]).toEqual(['south', 'south', 'south']);
    expect(k.slot).toBe('space');
    const urls = new Set([x, p, n, k].map((g) => (g as { url: string }).url));
    expect(urls.size).toBe(4);
    expect((x as { url: string }).url).toBe(glyphUrl('xbox', 'south'));
    expect((p as { url: string }).url).toBe(glyphUrl('playstation', 'south'));
    expect((n as { url: string }).url).toBe(glyphUrl('switch', 'south'));
  });
  it('Steam Deck uses the Xbox-layout artwork (the pack has no Deck set)', () => {
    expect(artFamily('steamdeck')).toBe('xbox');
    expect(promptEntries('steamdeck', 'play')).toEqual(promptEntries('xbox', 'play'));
  });
  it('Pause shows the family’s own Start glyph: Xbox via the sprite sheet, PlayStation Options, Switch Plus', () => {
    const pause = (s: PromptStyle) => promptEntries(s, 'play').find((e) => e.label === 'Pause')!.glyphs[0];
    expect(pause('xbox').kind).toBe('sprite');
    expect(pause('playstation')).toMatchObject({ kind: 'img', slot: 'start' });
    expect(pause('switch')).toMatchObject({ kind: 'img', slot: 'start' });
    expect(pause('keyboard').slot).toBe('esc');
    expect(promptBarHtml('xbox', 'play')).toContain('glyph-sprite');
  });
  it('touch shows no prompts at all; neither does a context of none', () => {
    expect(promptEntries('touch', 'menu')).toEqual([]);
    expect(promptEntries('xbox', 'none')).toEqual([]);
    expect(promptBarHtml('touch', 'menu')).toBe('');
  });
  it('menus teach Select / Back (and Adjust on a slider)', () => {
    expect(promptEntries('xbox', 'menu').map((e) => e.label)).toEqual(['Move', 'Select', 'Back']);
    expect(promptEntries('xbox', 'adjust').map((e) => e.label)).toEqual(['Move', 'Adjust', 'Select', 'Back']);
  });
});

describe('prompt source selection', () => {
  const clock = () => { let t = 0; return { now: () => t, adv: (ms: number) => { t += ms; } }; };

  it('starts on the platform default and follows deliberate use', () => {
    const c = clock();
    const s = new PromptState(c.now, 'touch');
    expect(s.style).toBe('touch');
    s.noteActivity('gamepad'); s.setFamily('playstation');
    expect(s.style).toBe('playstation');
  });
  it('an unknown pad shows the Xbox layout; a Deck pad shows the Deck style', () => {
    const c = clock();
    const s = new PromptState(c.now, 'gamepad');
    expect(s.style).toBe('xbox');
    s.setFamily('steamdeck');
    expect(s.style).toBe('steamdeck');
  });
  it('mixed input does not flicker: after a switch the prompts hold for the dwell', () => {
    const c = clock();
    const s = new PromptState(c.now, 'keyboard');
    s.setFamily('xbox');
    c.adv(5000);
    const seen: string[] = [];
    // The player taps the screen while still holding the pad: alternating signals every 50 ms.
    for (let i = 0; i < 40; i++) {
      s.noteActivity(i % 2 === 0 ? 'gamepad' : 'touch');
      seen.push(s.style);
      c.adv(50);
    }
    const changes = seen.filter((v, i) => i > 0 && v !== seen[i - 1]).length;
    expect(changes).toBeLessThanOrEqual(Math.ceil((40 * 50) / PROMPT_DWELL_MS));
    // And never every other frame.
    expect(changes).toBeLessThan(10);
  });
  it('a real change of device is honoured once the dwell has passed', () => {
    const c = clock();
    const s = new PromptState(c.now, 'keyboard');
    c.adv(5000);
    s.noteActivity('gamepad');
    expect(s.source).toBe('gamepad');
    c.adv(PROMPT_DWELL_MS + 1);
    s.noteActivity('touch');
    expect(s.style).toBe('touch');
  });
  it('a lost pad falls back (keyboard on desktop, touch on a phone) and the prompts follow', () => {
    const c = clock();
    const s = new PromptState(c.now, 'gamepad');
    s.padLost('keyboard');
    expect(s.style).toBe('keyboard');
    const t = new PromptState(c.now, 'gamepad');
    t.padLost('touch');
    expect(t.style).toBe('touch');
  });
  it('the manual choice overrides auto for pad/keyboard use but never forces prompts onto a touch screen', () => {
    const c = clock();
    const s = new PromptState(c.now, 'gamepad');
    s.setFamily('xbox');
    s.pref = 'playstation';
    expect(s.style).toBe('playstation');
    s.pref = 'keyboard';
    expect(s.style).toBe('keyboard');
    const t = new PromptState(c.now, 'touch');
    t.pref = 'playstation';
    expect(t.style).toBe('touch');
  });
  it('the bar key only changes when the look would change (no re-render churn)', () => {
    expect(promptKey('xbox', 'menu')).toBe(promptKey('xbox', 'menu'));
    expect(promptKey('xbox', 'menu')).not.toBe(promptKey('xbox', 'play'));
  });
});

describe('stored prompt choice', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
  it('round-trips, defaults to auto, and shrugs off garbage or a refusing store', () => {
    const st = mem();
    expect(loadPref(st)).toBe('auto');
    for (const p of PROMPT_PREFS) { savePref(p, st); expect(loadPref(st)).toBe(p); }
    st.setItem('wtb.promptStyle', 'nonsense');
    expect(loadPref(st)).toBe('auto');
    expect(loadPref({ getItem: () => { throw new Error('denied'); } })).toBe('auto');
    expect(() => savePref('xbox', { setItem: () => { throw new Error('denied'); } })).not.toThrow();
  });
});
