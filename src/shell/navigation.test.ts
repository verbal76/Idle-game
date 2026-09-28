import { describe, expect, it } from 'vitest';
import { shouldLoadInWebView } from './navigation';

describe('WebView navigation (release audit)', () => {
  it('mailto: (bug report / feature request) goes to the OS, not into the game page', () => {
    const opened: string[] = [];
    expect(shouldLoadInWebView('mailto:a@b.c?subject=x', async (u) => { opened.push(u); })).toBe(false);
    expect(opened).toEqual(['mailto:a@b.c?subject=x']);
  });
  it('the game page itself and its resources still load in the WebView', () => {
    const opened: string[] = [];
    for (const u of ['https://localhost/abc/', 'about:blank', 'data:text/html,x', 'file:///music.mp3', 'blob:https://localhost/1']) {
      expect(shouldLoadInWebView(u, async (x) => { opened.push(x); })).toBe(true);
    }
    expect(opened).toEqual([]);
  });
  it('no app to handle the link: stays on the game without throwing', async () => {
    expect(shouldLoadInWebView('tel:123', () => Promise.reject(new Error('no handler')))).toBe(false);
    await new Promise(r => setTimeout(r, 0));
  });
});
