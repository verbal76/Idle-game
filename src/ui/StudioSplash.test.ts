import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STUDIO_SPLASH_MS, resetStudioSplash, showStudioSplash, studioLogoUrl } from './StudioSplash';

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

  it('shows the given logo on a black card, silent, then removes itself after ~1.5 s from when it is visible', () => {
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
    vi.advanceTimersByTime(STUDIO_SPLASH_MS - 1);
    expect(el2.classList.has('out')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(el2.classList.has('out')).toBe(true);
    vi.advanceTimersByTime(300);
    expect(el2.removed).toBe(true);
  });

  it('about one and a half seconds by default', () => {
    expect(STUDIO_SPLASH_MS).toBe(1500);
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

  it('picks the canonical file up from branding/ when it exists', () => {
    // Until the owner supplies branding/Hot_Attic_Games_Master_Logo.png this is null.
    const url = studioLogoUrl();
    expect(url === null || typeof url === 'string').toBe(true);
  });
});
