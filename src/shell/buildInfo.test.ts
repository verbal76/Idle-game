import { describe, expect, it } from 'vitest';
import { UNAVAILABLE, abbreviate, buildInfoText, clean, describeBuild, launchSource, otaName, type RawShellInfo } from './buildInfo';

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
