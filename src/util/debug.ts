// Rotating-buffer debug log persisted to localStorage so a "previous
// run" tail survives a crash-to-desktop (when the app dies before
// the bug-report email could be composed). Adapted from the
// sister-project pattern the user referenced.
//
// Lifecycle:
//   - On module import (load()), the contents of the "current" key
//     are moved into "previous" (the run that just ended) and
//     "current" is reset to []. So the FIRST bug report after a
//     crash sees the pre-crash entries under getPreviousRun().
//   - addEntry() pushes a record into the in-memory ring + queues a
//     debounced save to "current".
//   - The current run accumulates entries until the next module
//     load (i.e. the next time the WebView reloads).
//
// What's captured automatically:
//   - console.error overrides (any JS error explicitly logged)
//   - window.onerror (uncaught throws)
//   - unhandledrejection (failed promise chains)
//
// What's not captured automatically:
//   - regular console.log / console.warn (kept out so the buffer
//     doesn't fill with debug spam)
//   - game-loop events (need explicit addEntry calls if we want them)

interface DebugEntry {
  t: number; // ms epoch
  level: 'info' | 'warn' | 'error';
  msg: string;
}

const MAX_ENTRIES = 60;
const KEY_CURRENT  = 'wtb.debug.current';
const KEY_PREVIOUS = 'wtb.debug.previous';

let entries: DebugEntry[] = [];
let previousEntries: DebugEntry[] = [];
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function load(): void {
  try {
    const raw = window.localStorage?.getItem(KEY_CURRENT);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    previousEntries = Array.isArray(parsed) ? parsed as DebugEntry[] : [];
    // Persist the rotated previous run so a crash-to-desktop in the
    // very next moment doesn't lose it (we're about to overwrite
    // "current" with []). Then reset current.
    window.localStorage?.setItem(KEY_PREVIOUS, JSON.stringify(previousEntries));
    window.localStorage?.setItem(KEY_CURRENT, '[]');
  } catch {
    // localStorage unavailable / quota exceeded — previous run is
    // lost but this run still functions in-memory.
  }
}

function flushSave(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    window.localStorage?.setItem(KEY_CURRENT, JSON.stringify(entries));
  } catch { /* ignore quota / disabled storage */ }
}

function queueSave(): void {
  if (saveTimer !== null) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushSave();
  }, 500);
}

export function addEntry(level: DebugEntry['level'], msg: string): void {
  entries.push({ t: Date.now(), level, msg: String(msg).slice(0, 240) });
  // Cap the in-memory buffer; oldest entries fall off when the cap
  // is hit. 60 is enough to capture both warm-up and immediate
  // pre-crash state at typical 2-3 events / minute.
  while (entries.length > MAX_ENTRIES) entries.shift();
  queueSave();
}

export function getEntries(): DebugEntry[] { return entries.slice(); }
export function getPreviousRun(): DebugEntry[] { return previousEntries.slice(); }

export function formatEntry(e: DebugEntry): string {
  // HH:MM:SS.sss [level] msg — short, fits inside an email body
  // line without wrapping for typical messages.
  const dt = new Date(e.t);
  const ts = dt.toISOString().slice(11, 23);
  const lvl = e.level.padEnd(5);
  return `[${ts}] [${lvl}] ${e.msg}`;
}

// Wire automatic capture as a one-time module side-effect.
load();

const ORIG_CONSOLE_ERROR = console.error;
/** Never throws, whatever it is given (undefined, circular, BigInt, functions). */
export function describeForLog(a: unknown): string {
  try {
    if (a instanceof Error) return `${a.name}: ${a.message}`;
    if (typeof a === 'string') return a;
    return (JSON.stringify(a) ?? String(a)).slice(0, 120);
  } catch {
    try { return String(a).slice(0, 120); } catch { return '[unprintable]'; }
  }
}

console.error = (...args: unknown[]): void => {
  // Logging must never become the error: a throw here would turn a
  // handled problem into an uncaught one.
  try { addEntry('error', args.map(describeForLog).join(' ')); } catch { /* ignore */ }
  ORIG_CONSOLE_ERROR(...args);
};

window.addEventListener('error', (e: ErrorEvent) => {
  addEntry('error', `${e.message || 'error'} @ ${e.filename || '?'}:${e.lineno ?? '?'}:${e.colno ?? '?'}`);
});
window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  const reason = describeForLog(e.reason);
  addEntry('error', `unhandledrejection: ${reason}`);
});

// Force a final save when the page is hidden — mirrors the
// pagehide pattern in main.ts for profile.save(). Belt-and-
// suspenders for crash-to-desktop where the debounced save would
// otherwise be lost.
window.addEventListener('pagehide', flushSave);

// Mark the session boundary in the log so the "previous run" tail
// always shows what the session actually was, not just errors.
addEntry('info', 'session start');
