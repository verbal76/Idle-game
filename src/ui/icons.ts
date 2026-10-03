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

/** Steering chevrons. */
export const ICON_LEFT = svg('icon-steer', '<path fill="currentColor" d="M15.6 3.6a1.6 1.6 0 010 2.3L9.5 12l6.1 6.1a1.6 1.6 0 11-2.3 2.3l-7.2-7.2a1.7 1.7 0 010-2.4l7.2-7.2a1.6 1.6 0 012.3 0z"/>');
export const ICON_RIGHT = svg('icon-steer', '<path fill="currentColor" d="M8.4 3.6a1.6 1.6 0 000 2.3l6.1 6.1-6.1 6.1a1.6 1.6 0 102.3 2.3l7.2-7.2a1.7 1.7 0 000-2.4l-7.2-7.2a1.6 1.6 0 00-2.3 0z"/>');

/** Mountain: altitude left to ride. */
export const ICON_ALT = svg('icon-alt', '<path fill="currentColor" d="M2 20l6.5-11 4 6.2 2.6-4.2L22 20z"/>');

/** Pencil: rename / manage. */
export const ICON_EDIT = svg('icon-edit', '<path fill="currentColor" d="M15.7 3.3a2.4 2.4 0 013.4 0l1.6 1.6a2.4 2.4 0 010 3.4L9.4 19.6 3.5 21l1.4-5.9zM6.6 16.7l-.5 2 2-.5L17.6 8.7l-1.4-1.4z"/>');

/** Circular arrow: flips. */
export const ICON_FLIP = svg('icon-flip', '<g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12a7.5 7.5 0 11-2.2-5.3"/><path d="M19.8 3.5v4.2h-4.2"/></g>');

/** Horizontal spin arrows: spins. */
export const ICON_SPIN = svg('icon-spin', '<g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="9" ry="4.5"/><path d="M16.5 4.8l2.4 2.9-3.6.9"/></g>');

/** Ring. */
export const ICON_RING = svg('icon-ring', '<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="3"/>');

/** Check mark (a finished goal). */
export const ICON_CHECK = svg('icon-check', '<path fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.8l5 5 10-11"/>');

/** Dice (random name). */
export const ICON_DICE = svg('icon-dice', '<g fill="currentColor"><path fill-rule="evenodd" d="M6 3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6a3 3 0 013-3zm2.5 4.2a1.3 1.3 0 100 2.6 1.3 1.3 0 000-2.6zm7 7a1.3 1.3 0 100 2.6 1.3 1.3 0 000-2.6zM12 10.7a1.3 1.3 0 100 2.6 1.3 1.3 0 000-2.6z"/></g>');

/** Keyboard cursor / type. */
export const ICON_TYPE = svg('icon-type', '<path fill="currentColor" d="M4 5.5A1.5 1.5 0 015.5 4h13A1.5 1.5 0 0120 5.5V8h-2V6h-5v12h2v2H9v-2h2V6H6v2H4z"/>');

/** Speed strip (a boost bar). */
export const ICON_STRIP = svg('icon-strip', '<path fill="currentColor" d="M5 7h9l5 5-5 5H5l5-5z"/>');

/** Bounce off the lip. */
export const ICON_LIP = svg('icon-lip', '<g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4v7a6 6 0 01-6 6H6"/><path d="M10 12.5L5.5 17 10 21.5"/></g>');

/** Cork: a flip and a spin in one jump. */
export const ICON_STAR = svg('icon-star', '<path fill="currentColor" d="M12 2.8l2.7 5.9 6.4.7-4.8 4.3 1.4 6.3L12 16.7 6.3 20l1.4-6.3L2.9 9.4l6.4-.7z"/>');

/** Chain: combo. */
export const ICON_CHAIN = svg('icon-chain', '<g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M10 14l4-4"/><path d="M8.2 11.8l-2 2a3.4 3.4 0 004.8 4.8l2-2"/><path d="M15.8 12.2l2-2a3.4 3.4 0 00-4.8-4.8l-2 2"/></g>');

/** Warning triangle. */
export const ICON_WARN = svg('icon-warn', '<path fill="currentColor" d="M12 3l10 18H2zm-1 7v5h2v-5zm0 7v2h2v-2z"/>');

/**
 * Turns the ❄ and ✔ characters in already-escaped text into the bundled
 * SVG icons (they render differently on every Android skin as text).
 */
export function withIcons(escapedHtml: string): string {
  return escapedHtml.replace(/❄/g, ICON_FLAKE).replace(/✔/g, ICON_CHECK);
}

/** Deep carve (curved arrow). */
export const ICON_CARVE = svg('icon-carve', '<g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19C5 10 11 5.5 18 8"/><path d="M13.5 4.5L18.5 8 13 11"/></g>');
