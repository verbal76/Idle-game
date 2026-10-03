import { BUILD_INFO } from '../__generated__/build-info';
import { buildInfoText, describeBuild, otaName } from '../shell/buildInfo';
import { getEntries, getPreviousRun, formatEntry } from './debug';

// Bug-report / feature-request mailto composer for the in-WebView
// Settings panel. The diagnostic block is the same Build / Update Info
// rows the About screen shows (shell/buildInfo.ts), so a report always
// identifies the exact APK, runtime, update and commit.
//
// Open mechanism: an <a href="mailto:"> click triggers an Android
// ACTION_VIEW intent in the WebView; Android resolves it to the user's
// default email app. It works on existing APKs with no native handler,
// so it is OTA-deliverable.

const SUPPORT_EMAIL = 'hotatticgames@gmail.com';

function diagnosticBlock(): string {
  return `${buildInfoText(describeBuild(window.__OTA__, BUILD_INFO))}\nAgent: ${navigator.userAgent}`;
}

function buildLabel(): string {
  const n = otaName(window.__OTA__);
  return n === 'Unavailable' || n.startsWith('None') ? '' : ` — ${n}`;
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
    `Where's the Bottom? bug report${buildLabel()}`,
    'Describe what happened above this line. Anything below is for context — leave it as-is.',
  );
}

export function composeFeatureRequestUrl(): string {
  return composeUrl(
    `Where's the Bottom? feature request${buildLabel()}`,
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
