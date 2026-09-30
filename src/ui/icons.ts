// Inline SVG icons for UI chrome, drawn in currentColor so they take the
// button's text colour. Replaces emoji (which render differently on
// every Android skin) in buttons and read-outs.

const svg = (cls: string, body: string, viewBox = '0 0 24 24') =>
  `<svg class="ui-icon ${cls}" viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;

/** Snowflake: the currency mark. */
export const ICON_FLAKE = svg('icon-flake',
  '<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">'
  + '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/>'
  + '<path d="M9 3.8l3 2.4 3-2.4M9 20.2l3-2.4 3 2.4M3.6 10.6l3.6-1.4-.6-3.8M20.4 13.4l-3.6 1.4.6 3.8M3.6 13.4l3.6 1.4-.6 3.8M20.4 10.6l-3.6-1.4.6-3.8"/></g>');

/** Bar chart: stats. */
export const ICON_STATS = svg('icon-stats',
  '<g fill="currentColor"><rect x="3" y="12" width="4.5" height="9" rx="1.2"/><rect x="9.75" y="6" width="4.5" height="15" rx="1.2"/><rect x="16.5" y="3" width="4.5" height="18" rx="1.2"/></g>');

/** Up arrow in a box: upgrades. */
export const ICON_UPGRADE = svg('icon-upgrade',
  '<path fill="currentColor" d="M12 2.5l8 8.2h-5V21H9v-10.3H4z"/>');

/** Play triangle. */
export const ICON_PLAY = svg('icon-play', '<path fill="currentColor" d="M7 4.2v15.6c0 .9 1 1.4 1.7.9l11.6-7.8a1.1 1.1 0 000-1.8L8.7 3.3C8 2.8 7 3.3 7 4.2z"/>');
