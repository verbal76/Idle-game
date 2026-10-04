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

import { PLAY_REQUIRED_TARGET_SDK, PLAY_REQUIREMENT_VERIFIED_ON, SIGNING_STATE, playCompliance } from './playTarget';

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
  updatesEnabled?: unknown;
  // From the shell's Platform constants (no extra native module).
  device?: unknown;
}

export interface BundleStamp {
  commit: string; dirty: boolean; builtAt: string;
  appName?: string; packageId?: string;
  /** Public release name/number from release.json ("Where's the Bottom? v83"). */
  productName?: string; publicVersion?: number;
  minSdk?: number | null; compileSdk?: number | null; targetSdk?: number | null;
}

/** Page-side facts the shell cannot know (locale) and the live update state. */
export interface DiagnosticContext {
  locale?: string | null;
  updateStatus?: string | null;
  updateStatusAt?: string | null;
}

export type InfoGroup = 'application' | 'device' | 'install' | 'ota' | 'update' | 'play';

export interface InfoRow {
  id: string;
  group?: InfoGroup;
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

const UPDATE_STATUS_TEXT: Record<string, string> = {
  idle: 'Idle',
  checking: 'Checking for an update',
  'up-to-date': 'Up to date',
  downloading: 'Downloading an update',
  ready: 'Update downloaded, waiting for a safe moment to apply',
  deferred: 'Update downloaded, waiting for the run to end',
  reloading: 'Applying the update',
  offline: 'Could not reach the update server (offline)',
  unavailable: 'Updates are not available in this build',
};

interface DeviceInfo { os?: unknown; release?: unknown; api?: unknown; model?: unknown; brand?: unknown }

function deviceInfo(raw: RawShellInfo | null | undefined): DeviceInfo {
  const d = raw?.device;
  return d && typeof d === 'object' ? (d as DeviceInfo) : {};
}

export function describeBuild(raw: RawShellInfo | null | undefined, bundle: BundleStamp, ctx: DiagnosticContext = {}): InfoRow[] {
  const r = raw ?? {};
  const m = otaMeta(raw);
  const row = (id: string, group: InfoGroup, label: string, v: string | null, abbrev = false): InfoRow => {
    const full = v ?? UNAVAILABLE;
    return { id, group, label, value: v && abbrev ? abbreviate(v) : full, full };
  };
  const bundleCommit = clean(bundle.commit) && bundle.commit !== 'unknown' ? bundle.commit : null;
  const commit = clean(m.commit) ?? bundleCommit;
  const commitShown = commit && bundle.dirty && commit === bundleCommit ? `${commit} (uncommitted changes)` : commit;

  const dev = deviceInfo(raw);
  const api = clean(dev.api);
  const release = clean(dev.release);
  const android = release && api ? `Android ${release} (API ${api})` : release ? `Android ${release}` : api ? `API ${api}` : null;
  const model = [clean(dev.brand), clean(dev.model)].filter((x): x is string => !!x);
  const device = model.length === 2 && model[1]!.toLowerCase().startsWith(model[0]!.toLowerCase()) ? model[1]! : model.join(' ') || null;

  const target = typeof bundle.targetSdk === 'number' ? bundle.targetSdk : null;
  const compliance = playCompliance(target);
  const complianceText = compliance === 'yes'
    ? `Yes (targets API ${target})`
    : compliance === 'no'
      ? `No: the build targets API ${target}, Play requires ${PLAY_REQUIRED_TARGET_SDK}`
      : 'Unverified';
  const status = clean(ctx.updateStatus);
  const updatesEnabled = r.updatesEnabled === true ? 'Yes' : r.updatesEnabled === false ? 'No' : null;
  const name = clean(bundle.appName);
  const pkg = clean(bundle.packageId);

  const pv = typeof bundle.publicVersion === 'number' && bundle.publicVersion > 0 ? `v${bundle.publicVersion}` : null;
  const product = clean(bundle.productName);

  return [
    row('product', 'application', 'Product', product && product !== 'unknown' ? product : null),
    row('public-version', 'application', 'Version', pv),
    row('app-name', 'application', 'Application', name && name !== 'unknown' ? name : null),
    row('android', 'device', 'Android', android),
    row('device', 'device', 'Device', device),
    row('locale', 'device', 'Locale', clean(ctx.locale)),
    row('package', 'install', 'Package ID', pkg && pkg !== 'unknown' ? pkg : null),
    row('app-version', 'install', 'App version', clean(r.nativeAppVersion)),
    row('native-build', 'install', 'Android build (versionCode)', clean(r.nativeVersionCode)),
    row('runtime', 'install', 'Runtime version', clean(r.runtimeVersion)),
    row('updates-enabled', 'ota', 'Updates enabled', updatesEnabled),
    row('channel', 'ota', 'Update channel', clean(r.channel)),
    row('source', 'ota', 'Running code from', SOURCE_TEXT[launchSource(raw)]),
    row('ota-name', 'ota', 'OTA', otaName(raw)),
    row('update-id', 'ota', 'Update ID', clean(r.updateId), true),
    row('published', 'ota', 'Published', clean(r.createdAt)),
    row('commit', 'ota', 'Source commit', commitShown, true),
    row('branch', 'ota', 'Source branch', clean(m.branch)),
    row('update-status', 'update', 'Update state', status ? (UPDATE_STATUS_TEXT[status] ?? status) : null),
    row('update-checked', 'update', 'State last changed', clean(ctx.updateStatusAt)),
    row('target-sdk', 'play', 'Target SDK (build config)', target === null ? null : String(target)),
    row('play-required', 'play', 'Play required target SDK', `${PLAY_REQUIRED_TARGET_SDK} (verified ${PLAY_REQUIREMENT_VERIFIED_ON})`),
    row('play-compliant', 'play', 'Play API compliant', complianceText),
    row('signing', 'play', 'Signing', SIGNING_STATE),
  ];
}

/** Plain text for the Copy button (full values). */
export function buildInfoText(rows: InfoRow[]): string {
  return rows.map(r => `${r.label}: ${r.full}`).join('\n');
}

const GROUP_TITLE: Record<InfoGroup, string> = {
  application: 'APPLICATION', device: 'DEVICE', install: 'INSTALL', ota: 'OTA', update: 'UPDATE STATE', play: 'GOOGLE PLAY / ANDROID',
};

/** Grouped plain text for Copy diagnostics: paste it straight into a chat. No secrets, no save data. */
export function diagnosticsText(rows: InfoRow[], capturedAt: string = new Date().toISOString()): string {
  const out = ['HOT ATTIC GAMES DIAGNOSTICS', `Captured at: ${capturedAt}`];
  for (const g of Object.keys(GROUP_TITLE) as InfoGroup[]) {
    const inGroup = rows.filter(r => r.group === g);
    if (!inGroup.length) continue;
    out.push('', GROUP_TITLE[g], ...inGroup.map(r => `  ${r.label}: ${r.full}`));
  }
  return out.join('\n');
}
