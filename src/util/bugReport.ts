import { BUILD_INFO } from '../__generated__/build-info';
import { BUILD_VERSION, OTA_VERSION } from '../version';
import { getEntries, getPreviousRun, formatEntry } from './debug';

// Bug-report / feature-request mailto composer for the in-WebView
// Settings panel. Adapted from a sister project's RN-side helper —
// since this app's Settings is rendered inside the WebView (not
// React Native), we can't use expo-constants / expo-device /
// react-native.Linking. The data we DO have on the web side:
//
//   - BUILD_INFO from src/__generated__/build-info.ts:
//       branch, commit, commitShort, builtAt, appVersion,
//       androidVersionCode, dirty
//   - BUILD_VERSION + OTA_VERSION from src/version.ts (the friendly
//     bump strings that surface on the About panel)
//   - window.__OTA__ injected by App.tsx pre-content:
//       updateId, runtimeVersion, channel, createdAt,
//       isEmbeddedLaunch
//   - navigator.userAgent — gives a hint of device/OS even without
//     expo-device
//
// Open mechanism: setting `window.location.href = "mailto:..."`
// triggers an Android ACTION_VIEW intent in the WebView; Android
// resolves it to the user's default email app. Doesn't actually
// unload the WebView page (the intent fires before navigation
// commits). Works on existing APKs without any RN-side handler
// change, so this is OTA-deliverable.

const SUPPORT_EMAIL = 'hotatticgames@gmail.com';

interface OtaInfo {
  updateId: string | null;
  runtimeVersion: string | null;
  channel: string | null;
  createdAt: string | null;
  isEmbeddedLaunch: boolean | null;
}

function readOta(): OtaInfo {
  const w = window as unknown as { __OTA__?: OtaInfo };
  return w.__OTA__ ?? {
    updateId: null, runtimeVersion: null, channel: null,
    createdAt: null, isEmbeddedLaunch: null,
  };
}

function diagnosticBlock(): string {
  const ota = readOta();
  return [
    `Build:    ${BUILD_VERSION}`,
    `OTA:      ${OTA_VERSION}`,
    `Branch:   ${BUILD_INFO.branch}${BUILD_INFO.dirty ? ' (dirty)' : ''}`,
    `Commit:   ${BUILD_INFO.commit}`,
    `Built:    ${BUILD_INFO.builtAt}`,
    `App:      ${BUILD_INFO.appVersion} (versionCode ${BUILD_INFO.androidVersionCode ?? 'n/a'})`,
    `Runtime:  ${ota.runtimeVersion ?? 'n/a'}`,
    `Channel:  ${ota.channel ?? 'n/a'}`,
    `Update:   ${ota.updateId ?? 'n/a'}`,
    `OTA at:   ${ota.createdAt ?? 'n/a'}`,
    `Embedded: ${ota.isEmbeddedLaunch === null ? 'n/a' : (ota.isEmbeddedLaunch ? 'yes' : 'no')}`,
    `Agent:    ${navigator.userAgent}`,
  ].join('\n');
}

function composeUrl(subject: string, leadIn: string): string {
  const current = getEntries().slice(-30).map(formatEntry).join('\n');
  const prev = getPreviousRun().slice(-30).map(formatEntry).join('\n');
  const body = [
    leadIn,
    '',
    '--- diagnostic info (auto-generated) ---',
    diagnosticBlock(),
    '',
    '--- previous run (pre-crash tail, last 30 entries) ---',
    prev || '(no previous-run entries)',
    '',
    '--- current run (last 30 entries) ---',
    current || '(no current-run entries)',
  ].join('\n');
  const params = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `mailto:${SUPPORT_EMAIL}?${params}`;
}

export function composeBugReportUrl(): string {
  return composeUrl(
    `Where's the Bottom? bug report — ${OTA_VERSION}`,
    'Describe what happened above this line. Anything below is for context — leave it as-is.',
  );
}

export function composeFeatureRequestUrl(): string {
  return composeUrl(
    `Where's the Bottom? feature request — ${OTA_VERSION}`,
    "Describe the feature you'd like above this line. Diagnostic info below identifies your build.",
  );
}

function openMailto(url: string): void {
  // Use a synthesized <a>.click() instead of `window.location.href = url`
  // so that if the device has no email app the WebView doesn't try
  // to render a 'mailto:' URL as a page (some Android WebViews log
  // an ERR_UNKNOWN_URL_SCHEME and stay on the previous page; the
  // <a>.click() path lets Android's intent resolver open a chooser
  // OR no-op silently without reloading).
  const a = document.createElement('a');
  a.href = url;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 0);
}

export function openBugReport(): void { openMailto(composeBugReportUrl()); }
export function openFeatureRequest(): void { openMailto(composeFeatureRequestUrl()); }
