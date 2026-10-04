import { describe, expect, it } from 'vitest';
import { UNAVAILABLE, abbreviate, buildInfoText, clean, describeBuild, diagnosticsText, launchSource, otaName, type RawShellInfo } from './buildInfo';

const bundle = { commit: 'c0ffee1234567890c0ffee1234567890c0ffee12', dirty: false, builtAt: '2026-09-28T00:00:00Z' };
const ota: RawShellInfo = {
  updateId: '01a0e4f8-a3b7-7817-b044-39670636a47d',
  runtimeVersion: '0.0.1',
  channel: 'preview',
  createdAt: '2026-09-28T01:02:03.000Z',
  isEmbeddedLaunch: false,
  isEmergencyLaunch: false,
  nativeAppVersion: '0.0.1',
  nativeVersionCode: 5,
  otaMeta: { commit: 'abc1234def5678abc1234def5678abc1234def56', label: 'OTA #65', message: 'Diag: Build / Update Info (OTA #65)', run: '170', branch: 'claude/x' },
};
const embedded: RawShellInfo = { ...ota, isEmbeddedLaunch: true, updateId: 'e7b3d2c1-0000-0000-0000-000000000000', otaMeta: undefined };
const byId = (rows: ReturnType<typeof describeBuild>) => Object.fromEntries(rows.map(r => [r.id, r]));

describe('Build / Update Info', () => {
  it('reports a downloaded OTA with its published name, id and commit', () => {
    const r = byId(describeBuild(ota, bundle));
    expect(r['source'].value).toBe('OTA update (downloaded)');
    expect(r['ota-name'].value).toBe('Diag: Build / Update Info (OTA #65)');
    expect(r['update-id'].value).toBe('01a0e4f8…');
    expect(r['update-id'].full).toBe('01a0e4f8-a3b7-7817-b044-39670636a47d');
    expect(r['commit'].full).toBe('abc1234def5678abc1234def5678abc1234def56');   // from the OTA's own metadata
    expect(r['runtime'].value).toBe('0.0.1');
    expect(r['channel'].value).toBe('preview');
    expect(r['native-build'].value).toBe('5');
    expect(r['branch'].value).toBe('claude/x');
  });

  it('detects the APK\'s embedded bundle and falls back to the bundle\'s own commit', () => {
    expect(launchSource(embedded)).toBe('embedded');
    const r = byId(describeBuild(embedded, bundle));
    expect(r['source'].value).toBe('Embedded in the APK');
    expect(r['ota-name'].value).toMatch(/^None/);
    expect(r['commit'].full).toBe(bundle.commit);
    expect(r['branch'].value).toBe(UNAVAILABLE);
  });

  it('emergency launch (failed update) is called out', () => {
    expect(launchSource({ ...ota, isEmergencyLaunch: true })).toBe('emergency');
  });

  it('outside the native app every native value is Unavailable, never undefined/null', () => {
    const rows = describeBuild(undefined, { commit: 'unknown', dirty: false, builtAt: '' });
    expect(launchSource(undefined)).toBe('no-shell');
    for (const row of rows) {
      expect(row.value).not.toMatch(/undefined|null|NaN/);
      expect(row.full).not.toMatch(/undefined|null|NaN/);
    }
    const r = byId(rows);
    expect(r['app-version'].value).toBe(UNAVAILABLE);
    expect(r['commit'].value).toBe(UNAVAILABLE);
    expect(r['source'].value).toBe('Browser (no native app shell)');
  });

  it('junk values become Unavailable', () => {
    const r = byId(describeBuild({ ...ota, channel: 'null', runtimeVersion: '', nativeVersionCode: NaN, updateId: undefined, isEmbeddedLaunch: null }, bundle));
    expect(r['channel'].value).toBe(UNAVAILABLE);
    expect(r['runtime'].value).toBe(UNAVAILABLE);
    expect(r['native-build'].value).toBe(UNAVAILABLE);
    expect(r['update-id'].value).toBe(UNAVAILABLE);
    expect(r['source'].value).toBe(UNAVAILABLE);
  });

  it('an OTA without publish metadata (older workflow) says so rather than inventing a name', () => {
    expect(otaName({ ...ota, otaMeta: undefined })).toBe(UNAVAILABLE);
    expect(otaName({ ...ota, otaMeta: { run: 171 } })).toBe('Publish run #171');
    expect(otaName({ ...ota, otaMeta: { label: 'OTA #66', message: 'fix thing' } })).toBe('OTA #66 — fix thing');
  });

  it('flags a bundle built from uncommitted changes', () => {
    const r = byId(describeBuild(embedded, { ...bundle, dirty: true }));
    expect(r['commit'].full).toBe(`${bundle.commit} (uncommitted changes)`);
  });

  it('helpers', () => {
    expect(clean('  x ')).toBe('x');
    expect(clean(0)).toBe('0');
    expect(clean({})).toBeNull();
    expect(abbreviate('short')).toBe('short');
    expect(buildInfoText(describeBuild(ota, bundle))).toContain('Update ID: 01a0e4f8-a3b7-7817-b044-39670636a47d');
  });
});

describe('Release diagnostics (About / Copy diagnostics)', () => {
  const build = { ...bundle, appName: "Where's the Bottom?", packageId: 'com.hotatticgames.snow', minSdk: 23, compileSdk: 34, targetSdk: 34 };
  const shell: RawShellInfo = { ...ota, updatesEnabled: true, device: { os: 'android', release: '14', api: 34, model: 'Pixel 7', brand: 'google' } };
  const ctx = { locale: 'en-US', updateStatus: 'up-to-date', updateStatusAt: '2026-10-03T10:00:00.000Z' };

  it('answers the questions a diagnostics paste must answer', () => {
    const r = byId(describeBuild(shell, build, ctx));
    expect(r['app-name'].full).toBe("Where's the Bottom?");
    expect(r['package'].full).toBe('com.hotatticgames.snow');
    expect(r['app-version'].full).toBe('0.0.1');
    expect(r['native-build'].full).toBe('5');
    expect(r['runtime'].full).toBe('0.0.1');
    expect(r['channel'].full).toBe('preview');
    expect(r['updates-enabled'].full).toBe('Yes');
    expect(r['update-id'].full).toBe('01a0e4f8-a3b7-7817-b044-39670636a47d');
    expect(r['commit'].full).toBe('abc1234def5678abc1234def5678abc1234def56');
    expect(r['android'].full).toBe('Android 14 (API 34)');
    expect(r['device'].full).toBe('google Pixel 7');
    expect(r['locale'].full).toBe('en-US');
    expect(r['target-sdk'].full).toBe('34');
    expect(r['play-required'].full).toMatch(/^36 \(verified \d{4}-\d{2}-\d{2}\)$/);
    expect(r['play-compliant'].full).toMatch(/^No: .*34.*36/);
    expect(r['signing'].full).toMatch(/Debug keystore/);
    expect(r['update-status'].full).toBe('Up to date');
  });

  it('copied text is grouped, labelled, timestamped and plain', () => {
    const text = diagnosticsText(describeBuild(shell, build, ctx), '2026-10-03T12:00:00.000Z');
    expect(text.split('\n')[0]).toBe('HOT ATTIC GAMES DIAGNOSTICS');
    expect(text).toContain('Captured at: 2026-10-03T12:00:00.000Z');
    for (const h of ['APPLICATION', 'DEVICE', 'INSTALL', 'OTA', 'UPDATE STATE', 'GOOGLE PLAY / ANDROID']) expect(text).toContain(`\n${h}\n`);
    expect(text.indexOf('INSTALL')).toBeLessThan(text.indexOf('OTA\n'));
    expect(text).toContain('  Package ID: com.hotatticgames.snow');
    expect(text).not.toMatch(/undefined|null|NaN/);
  });

  it('carries no secrets or personal data', () => {
    const text = diagnosticsText(describeBuild(shell, build, ctx));
    expect(text).not.toMatch(/password|secret|api[_-]?key|authorization|bearer/i);
    expect(text).not.toMatch(/@/);              // no e-mail addresses
  });

  it('shows the public version separately from OTA / commit / versionCode', () => {
    const r = byId(describeBuild(shell, { ...build, productName: "Where's the Bottom?", publicVersion: 83 }, ctx));
    expect(r['product'].full).toBe("Where's the Bottom?");
    expect(r['public-version'].full).toBe('v83');
    expect(r['ota-name'].full).not.toBe('v83');
    expect(r['native-build'].full).toBe('5');
    expect(r['commit'].full).not.toBe('v83');
    const text = diagnosticsText(describeBuild(shell, { ...build, publicVersion: 83 }, ctx));
    expect(text).toMatch(/Version: v83/);
    expect(byId(describeBuild(shell, build, ctx))['public-version'].full).toBe(UNAVAILABLE);
  });

  it('is honest when things are unavailable (browser, no shell, no SDK info)', () => {
    const r = byId(describeBuild(undefined, { commit: 'unknown', dirty: false, builtAt: '' }));
    for (const id of ['android', 'device', 'locale', 'package', 'updates-enabled', 'update-status', 'target-sdk', 'app-name', 'product', 'public-version']) expect(r[id].full, id).toBe(UNAVAILABLE);
    expect(r['play-compliant'].full).toBe('Unverified');
    const text = diagnosticsText(Object.values(r));
    expect(text).not.toMatch(/undefined|null|NaN/);
  });

  it('a compliant build says so', () => {
    const r = byId(describeBuild(shell, { ...build, targetSdk: 36 }, ctx));
    expect(r['play-compliant'].full).toBe('Yes (targets API 36)');
  });

  it('reports each update state in words (including applying and failure)', () => {
    const state = (s: string) => byId(describeBuild(shell, build, { updateStatus: s }))['update-status'].full;
    expect(state('reloading')).toBe('Applying the update');
    expect(state('ready')).toMatch(/downloaded/);
    expect(state('offline')).toMatch(/offline/);
    expect(state('checking')).toMatch(/Checking/);
    expect(state('something-new')).toBe('something-new');
  });
});
