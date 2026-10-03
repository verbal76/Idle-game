// Build / Update Info (Settings): turns the raw metadata the native shell
// injects (window.__OTA__, see App.tsx) plus the game bundle's own build
// stamp into display rows. Pure, so every fallback is unit-tested.
//
// Sources, all read at runtime - nothing here is hard-coded:
//  - native*        the app config baked into the installed APK
//                   (ExponentConstants.manifest), so it describes the APK
//                   even while an OTA is running
//  - runtimeVersion, channel, updateId, createdAt, isEmbeddedLaunch,
//    isEmergencyLaunch   expo-updates for the running update
//  - otaMeta        what the publishing workflow stamped into this OTA's
//                   manifest (app.config.js -> extra.ota)
//  - bundle         the game bundle's own build stamp (commit it was built from)

export const UNAVAILABLE = 'Unavailable';

export interface OtaMeta {
  commit?: unknown;
  label?: unknown;
  message?: unknown;
  run?: unknown;
  branch?: unknown;
}

export interface RawShellInfo {
  updateId?: unknown;
  runtimeVersion?: unknown;
  channel?: unknown;
  createdAt?: unknown;
  isEmbeddedLaunch?: unknown;
  isEmergencyLaunch?: unknown;
  nativeAppVersion?: unknown;
  nativeVersionCode?: unknown;
  otaMeta?: unknown;
}

export interface BundleStamp { commit: string; dirty: boolean; builtAt: string }

export interface InfoRow {
  id: string;
  label: string;
  value: string;       // what the row shows (long ids abbreviated)
  full: string;        // complete value (for Copy / "show full")
}

export type LaunchSource = 'ota' | 'embedded' | 'emergency' | 'no-shell' | 'unknown';

/** A usable string, or null for undefined / null / '' / 'null' / 'undefined' / non-strings. */
export function clean(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s === 'null' || s === 'undefined') return null;
  return s;
}

/** First 8 characters + '…' for long ids / SHAs; short values unchanged. */
export function abbreviate(v: string, keep = 8): string {
  return v.length > keep + 2 ? `${v.slice(0, keep)}…` : v;
}

export function launchSource(raw: RawShellInfo | null | undefined): LaunchSource {
  if (!raw) return 'no-shell';
  if (raw.isEmergencyLaunch === true) return 'emergency';
  if (raw.isEmbeddedLaunch === true) return 'embedded';
  if (raw.isEmbeddedLaunch === false && clean(raw.updateId)) return 'ota';
  return 'unknown';
}

const SOURCE_TEXT: Record<LaunchSource, string> = {
  ota: 'OTA update (downloaded)',
  embedded: 'Embedded in the APK',
  emergency: 'Embedded (emergency fallback after a failed update)',
  'no-shell': 'Browser (no native app shell)',
  unknown: UNAVAILABLE,
};

function otaMeta(raw: RawShellInfo | null | undefined): OtaMeta {
  const m = raw?.otaMeta;
  return m && typeof m === 'object' ? (m as OtaMeta) : {};
}

/** Human-readable OTA name: the workflow's label (e.g. "OTA #65"), else its run number. */
export function otaName(raw: RawShellInfo | null | undefined): string {
  const src = launchSource(raw);
  if (src === 'embedded' || src === 'emergency') return 'None (running the APK\'s built-in bundle)';
  if (src === 'no-shell') return UNAVAILABLE;
  const m = otaMeta(raw);
  const label = clean(m.label);
  const run = clean(m.run);
  const message = clean(m.message);
  if (label && message && !message.includes(label)) return `${label} — ${message}`;
  if (message) return message;
  if (label) return label;
  if (run) return `Publish run #${run}`;
  return UNAVAILABLE;
}

export function describeBuild(raw: RawShellInfo | null | undefined, bundle: BundleStamp): InfoRow[] {
  const r = raw ?? {};
  const m = otaMeta(raw);
  const row = (id: string, label: string, v: string | null, abbrev = false): InfoRow => {
    const full = v ?? UNAVAILABLE;
    return { id, label, value: v && abbrev ? abbreviate(v) : full, full };
  };
  const bundleCommit = clean(bundle.commit) && bundle.commit !== 'unknown' ? bundle.commit : null;
  const commit = clean(m.commit) ?? bundleCommit;
  const commitShown = commit && bundle.dirty && commit === bundleCommit ? `${commit} (uncommitted changes)` : commit;
  return [
    row('app-version', 'App version', clean(r.nativeAppVersion)),
    row('native-build', 'Android build (versionCode)', clean(r.nativeVersionCode)),
    row('runtime', 'Runtime version', clean(r.runtimeVersion)),
    row('channel', 'Update channel', clean(r.channel)),
    row('source', 'Running code from', SOURCE_TEXT[launchSource(raw)]),
    row('ota-name', 'OTA', otaName(raw)),
    row('update-id', 'Update ID', clean(r.updateId), true),
    row('published', 'Published', clean(r.createdAt)),
    row('commit', 'Source commit', commitShown, true),
    row('branch', 'Source branch', clean(m.branch)),
  ];
}

/** Plain text for the Copy button (full values). */
export function buildInfoText(rows: InfoRow[]): string {
  return rows.map(r => `${r.label}: ${r.full}`).join('\n');
}
