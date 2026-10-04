import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { STUDIO_LOGO_DISPLAY_FILE, STUDIO_LOGO_FILE, STUDIO_SPLASH_FADE_IN_MS, STUDIO_SPLASH_FADE_OUT_MS, STUDIO_SPLASH_MS, STUDIO_SPLASH_TOTAL_MS, resetStudioSplash, showStudioSplash, studioLogoUrl } from './StudioSplash';

interface Fake {
  id: string; src: string; alt: string; removed: boolean;
  children: Fake[];
  classList: { has(c: string): boolean };
  fire(t: string): void;
}

// Just enough DOM for the card.
function fakeDoc() {
  const mk = (tag: string) => {
    const handlers = new Map<string, Array<() => void>>();
    const classes = new Set<string>();
    const el = {
      tag, id: '', className: '', alt: '', src: '', draggable: true, removed: false,
      children: [] as unknown[],
      attrs: {} as Record<string, string>,
      classList: { add: (c: string) => classes.add(c), has: (c: string) => classes.has(c) },
      setAttribute(k: string, v: string) { this.attrs[k] = v; },
      appendChild(c: unknown) { this.children.push(c); return c; },
      addEventListener(t: string, f: () => void) { handlers.set(t, [...(handlers.get(t) ?? []), f]); },
      fire(t: string) { for (const f of handlers.get(t) ?? []) f(); },
      remove() { this.removed = true; },
    };
    return el;
  };
  const body = mk('body');
  return { createElement: mk, body } as unknown as Document & { body: ReturnType<typeof mk> };
}

describe('Hot Attic Games studio splash', () => {
  beforeEach(() => { vi.useFakeTimers(); resetStudioSplash(); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows the given logo on the start-up-colour card, silent, then fades out after the hold, counted from when it is visible', () => {
    const doc = fakeDoc();
    const el = showStudioSplash({ logoUrl: 'data:image/png;base64,AAAA', doc }) as unknown as Fake;
    expect(el).not.toBeNull();
    expect(el.id).toBe('studio-splash');
    expect((doc.body as unknown as { children: unknown[] }).children).toContain(el);
    const img = el.children[0]!;
    expect(img.src).toBe('data:image/png;base64,AAAA');
    expect(img.alt).toBe('Hot Attic Games');
    vi.advanceTimersByTime(5000);                 // not visible yet (no load): nothing removed before the backstop
    // load arrives: the full duration starts now (fresh card)
    resetStudioSplash();
    const el2 = showStudioSplash({ logoUrl: 'x.png', doc }) as unknown as Fake;
    const img2 = el2.children[0]!;
    img2.fire('load');
    expect(el2.classList.has('ready')).toBe(true);        // the logo fades in
    vi.advanceTimersByTime(STUDIO_SPLASH_FADE_IN_MS + STUDIO_SPLASH_MS - 1);
    expect(el2.classList.has('out')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(el2.classList.has('out')).toBe(true);
    vi.advanceTimersByTime(STUDIO_SPLASH_FADE_OUT_MS);
    expect(el2.removed).toBe(true);
  });

  it('is about 2 to 3 seconds in total (fade in + hold + fade out)', () => {
    expect(STUDIO_SPLASH_TOTAL_MS).toBe(STUDIO_SPLASH_FADE_IN_MS + STUDIO_SPLASH_MS + STUDIO_SPLASH_FADE_OUT_MS);
    expect(STUDIO_SPLASH_TOTAL_MS).toBeGreaterThanOrEqual(2000);
    expect(STUDIO_SPLASH_TOTAL_MS).toBeLessThanOrEqual(3000);
  });

  it('is shown once per page load: no replay on later navigation', () => {
    const doc = fakeDoc();
    expect(showStudioSplash({ logoUrl: 'x.png', doc })).not.toBeNull();
    expect(showStudioSplash({ logoUrl: 'x.png', doc })).toBeNull();
    expect((doc.body as unknown as { children: unknown[] }).children).toHaveLength(1);
  });

  it('cannot get stuck: a logo that fails to load removes the card at once', () => {
    const doc = fakeDoc();
    const el = showStudioSplash({ logoUrl: 'broken.png', doc }) as unknown as Fake;
    (el.children[0] as Fake).fire('error');
    expect(el.classList.has('out')).toBe(true);
  });

  it('cannot get stuck: a logo that never loads is removed by the backstop', () => {
    const doc = fakeDoc();
    const el = showStudioSplash({ logoUrl: 'slow.png', doc }) as unknown as Fake;
    vi.advanceTimersByTime(STUDIO_SPLASH_MS + 4000);
    expect(el.classList.has('out')).toBe(true);
  });

  it('with no canonical logo present nothing is shown (and no substitute is drawn)', () => {
    const doc = fakeDoc();
    expect(showStudioSplash({ logoUrl: null, doc })).toBeNull();
    expect((doc.body as unknown as { children: unknown[] }).children).toHaveLength(0);
  });

  const CANONICAL_SHA256 = 'e3d9bb5653eafb783eede827606e7ac73a4e45564a1c25b1ed13ad1429f48c4e';

  it('uses the canonical file: found, hash pinned, and the page build resolves its display copy', () => {
    expect(STUDIO_LOGO_FILE).toBe('Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png');
    expect(existsSync(STUDIO_LOGO_FILE)).toBe(true);
    // Pinned: replacing the artwork is a deliberate act (update this hash, re-run scripts/make-studio-logo.mjs, docs/studio-splash.md).
    expect(createHash('sha256').update(readFileSync(STUDIO_LOGO_FILE)).digest('hex')).toBe(CANONICAL_SHA256);
    const url = studioLogoUrl();
    expect(typeof url).toBe('string');                       // a missing file would be null
    expect(url).toMatch(/studio-logo/);
  });

  it('the displayed file is made from exactly that canonical artwork (sidecar hash) and is small enough for the page', () => {
    const meta = JSON.parse(readFileSync('src/assets/studio-logo.json', 'utf8'));
    expect(meta.source).toBe(STUDIO_LOGO_FILE);
    expect(meta.sourceSha256).toBe(CANONICAL_SHA256);       // fails if the canonical art changed and the copy was not rebuilt
    const bytes = readFileSync(STUDIO_LOGO_DISPLAY_FILE);
    expect(bytes.length).toBe(meta.bytes);
    expect(bytes.length).toBeLessThan(600_000);              // the page must stay far below the ~10 MB Binder limit
  });

  it('canonical PNG and its display copy are 1536x1024 with alpha: transparency kept, 3:2 aspect, displayed contained', () => {
    const png = readFileSync(STUDIO_LOGO_FILE);
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1536, 1024]);
    expect(png[25]).toBe(6);                                  // colour type 6 = RGBA
    const w = readFileSync(STUDIO_LOGO_DISPLAY_FILE);
    expect(w.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(w.subarray(8, 12).toString('latin1')).toBe('WEBP');
    expect(w.subarray(12, 16).toString('latin1')).toBe('VP8X');
    expect(w[20] & 0x10).toBe(0x10);                          // VP8X alpha flag
    expect([w.readUIntLE(24, 3) + 1, w.readUIntLE(27, 3) + 1]).toEqual([1536, 1024]);
    const css = readFileSync('src/style.css', 'utf8');
    expect(css).toMatch(/\.studio-splash img \{[^}]*object-fit: contain/);
    expect(css).toMatch(/\.studio-splash img \{[^}]*max-width: 100%[^}]*max-height: 100%/);
  });

  it('no stale reference to the obsolete branding/ path remains in source', () => {
    const src = readFileSync('src/ui/StudioSplash.ts', 'utf8');
    expect(src).not.toMatch(/branding\/Hot_Attic/);
  });
});
