/**
 * A small non-blocking notice at the top of the screen (above every
 * panel), e.g. "Progress isn't saving". One per key; set(null) hides it.
 */
export function statusBanner(key: string): (text: string | null) => void {
  let el: HTMLElement | null = null;
  return (text) => {
    if (!text) { el?.remove(); el = null; return; }
    if (!el) {
      el = document.createElement('div');
      el.className = 'status-banner';
      el.dataset.banner = key;
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = text;
  };
}
