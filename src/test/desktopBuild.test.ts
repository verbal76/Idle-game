import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { artifactName, expand, parseArgs, verifySource } from '../../scripts/build.mjs';
import { buildManifest, checkParity, checksumLines, mergeManifests } from '../../scripts/make-release-manifest.mjs';

const require = createRequire(import.meta.url);
const { resolveGameFile } = require('../../desktop/paths.js') as { resolveGameFile: (dir: string, p: string) => string | null };

describe('coordinated build interface (studio standard v2.0 section 5)', () => {
  it('accepts exactly android, windows, linux and all; all means all three', () => {
    for (const p of ['android', 'windows', 'linux', 'all']) expect(parseArgs(['--platform', p]).platform).toBe(p);
    expect(() => parseArgs([])).toThrow(/--platform/);
    expect(() => parseArgs(['--platform', 'macos'])).toThrow(/--platform/);
    expect(() => parseArgs(['--platform', 'linux', '--bogus'])).toThrow(/unknown argument/);
    expect(expand('all')).toEqual(['android', 'windows', 'linux']);
    expect(expand('linux')).toEqual(['linux']);
  });

  it('is wired to the real build script and never publishes', () => {
    const src = readFileSync('scripts/build.mjs', 'utf8');
    expect(src).toMatch(/INCOMPLETE: missing/);                      // a partial build is never reported as complete
    expect(src).toMatch(/uncommitted changes/);                      // no unrecorded local change in a production artifact
    expect(src).toMatch(/is not the approved source/);
    expect(src).not.toMatch(/gh-release|upload|eas-cli|softprops|steamcmd/i);
  });
});

describe('desktop shell (Windows / Linux)', () => {
  const dir = '/games/wtb/game';
  it('serves only files inside the game folder', () => {
    expect(resolveGameFile(dir, '/')).toBe(`${dir}/index.html`);
    expect(resolveGameFile(dir, '/music/Powder_Parade.mp3')).toBe(`${dir}/music/Powder_Parade.mp3`);
    for (const bad of ['/../secret', '/%2e%2e/secret', '/music/../../x', '/a%00b', '/%E0%A4%A']) expect(resolveGameFile(dir, bad), bad).toBeNull();
  });

  it('keeps the page sandboxed and locked to its own origin', () => {
    const main = readFileSync('desktop/main.js', 'utf8');
    expect(main).toMatch(/contextIsolation: true/);
    expect(main).toMatch(/nodeIntegration: false/);
    expect(main).toMatch(/sandbox: true/);
    expect(main).toMatch(/will-navigate/);
    expect(main).toMatch(/setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
    expect(main).toMatch(/backgroundColor: '#0b1320'/);
  });

  it('pins Electron exactly (a floating runtime would make builds unreproducible)', () => {
    const pkg = JSON.parse(readFileSync('desktop/package.json', 'utf8'));
    expect(pkg.devDependencies.electron).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('coordinated manifest', () => {
  const sha = 'a'.repeat(40);
  const mk = (platform: string, over: Record<string, string> = {}) => buildManifest({
    platform, signing: platform === 'android' ? 'debug' : 'unsigned', artifacts: ['release.json'],
    env: { SOURCE_SHA: '', GITHUB_SHA: sha, ...over } as unknown as NodeJS.ProcessEnv, now: new Date('2026-10-12T00:00:00Z'),
    ...(platform === 'android' ? {} : { runtime: 'electron-44.7.0', toolchain: { electron: '44.7.0' } }),
  });

  it('merges every platform into one manifest with one SHA and one build number, and lists checksums', () => {
    const merged = mergeManifests([mk('android'), mk('windows'), mk('linux')]);
    expect(merged.schema).toBe(2);
    expect(merged.platforms.map((p: { platform: string }) => p.platform)).toEqual(['android', 'windows', 'linux']);
    expect(merged.buildNumber).toBeGreaterThan(0);
    expect(merged.platforms[1].runtimeVersion).toBe('electron-44.7.0');
    expect(merged.platforms[1].buildConfiguration.signing).toBe('unsigned');
    expect(checksumLines(merged).trim().split('\n')).toHaveLength(3);
    expect(checksumLines(merged)).toMatch(/^[0-9a-f]{64} {2}release\.json$/m);
  });

  it('refuses to combine artifacts built from different commits', () => {
    expect(() => mergeManifests([mk('android'), mk('linux', { GITHUB_SHA: 'b'.repeat(40) })])).toThrow(/parity/);
    expect(checkParity([mk('android'), mk('linux', { GITHUB_SHA: 'b'.repeat(40) })]).length).toBeGreaterThan(0);
  });

  it('merges coordinated (schema 2) per-platform manifests too, and refuses a platform listed twice', () => {
    const one = mergeManifests([mk('linux')]);
    const two = mergeManifests([one, mk('windows')]);
    expect(two.platforms.map((p: { platform: string }) => p.platform)).toEqual(['linux', 'windows']);
    expect(() => mergeManifests([one, mk('linux')])).toThrow(/listed twice/);
  });
});


describe('release vs development builds (exact-source gate)', () => {
  const SHA = 'a'.repeat(40);
  const rel = { buildNumber: 85, title: "Where's the Bottom? Build 85" } as never;
  const auth = () => ({ baselineSha: 'b'.repeat(40), authoritativeLine: 'line' });
  const base = { platform: 'linux', buildNumber: undefined, sourceSha: undefined, out: 'o', skipTests: false, allowDirty: false, release: false } as Parameters<typeof verifySource>[0];
  const deps = (over: { head?: string; dirty?: boolean; ok?: boolean; reason?: string } = {}) => ({
    git: (...a: string[]) => (a[0] === 'rev-parse' ? (over.head ?? SHA) : over.dirty ? ' M src/main.ts' : ''),
    releaseInfo: () => rel,
    authoritative: auth,
    verifyApprovedSource: () => ({ ok: over.ok ?? true, reason: over.reason ?? 'ok' }),
  });
  const rls = { ...base, release: true, sourceSha: SHA, buildNumber: 85 };

  it('a release needs the exact approved SHA, the build number, a clean tree and verified source', () => {
    expect(verifySource(rls, deps())).toMatchObject({ qualification: 'release', dirty: false, ontoAuthoritativeLine: true });
    expect(() => verifySource({ ...rls, sourceSha: undefined }, deps())).toThrow(/needs --source-sha/);
    expect(() => verifySource({ ...rls, sourceSha: 'abc123' }, deps({ head: 'abc123' }))).toThrow(/40-character/);
    expect(() => verifySource({ ...rls, buildNumber: undefined }, deps())).toThrow(/needs --build-number/);
  });
  it('rejects a checkout that is not the approved commit', () => {
    expect(() => verifySource(rls, deps({ head: 'c'.repeat(40) }))).toThrow(/is not the approved source/);
  });
  it('rejects a build number that disagrees with release.json', () => {
    expect(() => verifySource({ ...rls, buildNumber: 99 }, deps())).toThrow(/does not match release\.json/);
  });
  it('rejects a dirty tree, --allow-dirty and --skip-tests for a release', () => {
    expect(() => verifySource(rls, deps({ dirty: true }))).toThrow(/uncommitted changes/);
    expect(() => verifySource({ ...rls, allowDirty: true }, deps())).toThrow(/refuses --allow-dirty/);
    expect(() => verifySource({ ...rls, skipTests: true }, deps())).toThrow(/refuses --skip-tests/);
  });
  it('rejects source that is not on the authoritative line or lacks the baseline', () => {
    expect(() => verifySource(rls, deps({ ok: false, reason: 'not on the authoritative line' }))).toThrow(/release source refused: not on the authoritative line/);
  });
  it('a development build allows a dirty tree only when asked, and says so', () => {
    expect(() => verifySource(base, deps({ dirty: true }))).toThrow(/uncommitted changes/);
    expect(verifySource({ ...base, allowDirty: true }, deps({ dirty: true }))).toMatchObject({ qualification: 'development', dirty: true, ontoAuthoritativeLine: null });
    expect(verifySource(base, deps())).toMatchObject({ qualification: 'development', dirty: false });
  });
  it('only a release gets the standard file names; development artifacts say DEV', () => {
    const names = ['Wheres the Bottom Build 85 APK.apk', 'Wheres the Bottom Build 85 EXE.zip', 'Wheres the Bottom Build 85 Linux.tar.gz'];
    for (const n of names) expect(artifactName(n, 'release')).toBe(n);
    expect(names.map((n) => artifactName(n, 'development'))).toEqual([
      'Wheres the Bottom Build 85 DEV APK.apk', 'Wheres the Bottom Build 85 DEV EXE.zip', 'Wheres the Bottom Build 85 DEV Linux.tar.gz',
    ]);
    expect(artifactName('Wheres-the-Bottom-v85-EXE.zip', 'development')).toBe('Wheres-the-Bottom-v85-DEV-EXE.zip');
  });
  it('the real script wires release mode and the post-build tree check', () => {
    const src = readFileSync('scripts/build.mjs', 'utf8');
    expect(src).toMatch(/verifyApprovedSource/);
    expect(src).toMatch(/the tree changed during the build/);
    expect(src).toMatch(/qualification/);
  });
});

describe('desktop shell controller + Steam Deck wiring', () => {
  it('exposes only platform, steamDeck and quit to the page', () => {
    const pre = readFileSync('desktop/preload.js', 'utf8');
    expect(pre).toMatch(/exposeInMainWorld\('wtbDesktop'/);
    expect(pre).toMatch(/quit:/);
    expect(pre).not.toMatch(/exposeInMainWorld\([^)]*,\s*(ipcRenderer|require)/);
  });
  it('goes fullscreen on a Steam Deck, quits on request, and forwards suspend to the page', () => {
    const main = readFileSync('desktop/main.js', 'utf8');
    expect(main).toMatch(/process\.env\.SteamDeck === '1'/);
    expect(main).toMatch(/fullscreen: FULLSCREEN/);
    expect(main).toMatch(/ipcMain\.on\('wtb:quit'/);
    expect(main).toMatch(/powerMonitor\.on\('suspend'/);
    expect(main).toMatch(/preload: path\.join\(__dirname, 'preload\.js'\)/);
  });
});
