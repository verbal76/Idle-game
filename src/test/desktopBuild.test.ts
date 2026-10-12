import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expand, parseArgs } from '../../scripts/build.mjs';
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

