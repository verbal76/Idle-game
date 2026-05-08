// Letter-by-letter bouncy title for menu screens. Wraps each char
// in a <span> with a staggered animation-delay so the whole word
// reads as a wave travelling left-to-right while each letter bobs
// individually. CSS for the bounce keyframes lives in style.css
// under .title-bouncy.
//
// The HTML output is meant to be dropped into a host element with
// the .title-bouncy class — typically an <h1> on a fullscreen-panel
// menu screen. Positioning + sizing comes from the host element's
// CSS so this util doesn't care about layout.

function escapeHtml(ch: string): string {
  return (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
  )[ch] ?? ch;
}

export function bouncyTextHtml(s: string): string {
  return s.split('').map((c, i) => {
    const safe = c === ' ' ? '&nbsp;' : escapeHtml(c);
    // 70 ms stagger between letters → "Where's the Bottom?" (19 chars)
    // takes ~1.26 s for the wave to traverse, with each letter's
    // bounce animation cycling at 1.6 s. The mismatch keeps the
    // pattern from looking mechanical.
    const delay = (i * 0.07).toFixed(2);
    return `<span style="animation-delay:${delay}s">${safe}</span>`;
  }).join('');
}
