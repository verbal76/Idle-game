// The one-at-a-time release rule: .github/scripts/release-route.sh decides
// for both eas-build.yml (APK) and eas-update.yml (OTA) from one commit
// range, so a single push can never start both. Runs the real script
// against a scratch git repository.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve(__dirname, '../../.github/scripts/release-route.sh');
let dir = '';
const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();
const commit = (files: Record<string, string>, msg: string) => {
  for (const [f, c] of Object.entries(files)) { mkdirSync(join(dir, f, '..'), { recursive: true }); writeFileSync(join(dir, f), c); }
  git('add', '-A'); git('commit', '-qm', msg);
  return git('rev-parse', 'HEAD');
};
const route = (before: string, sha: string, event = 'push') => {
  const out = execFileSync('bash', [SCRIPT], { cwd: dir, encoding: 'utf8', env: { ...process.env, BEFORE: before, GITHUB_SHA: sha, GITHUB_EVENT_NAME: event, GITHUB_OUTPUT: '/dev/null' } });
  return /native=(\w+)/.exec(out)![1];
};
const app = (version: string, extra = 0) => JSON.stringify({ expo: { version, extra } });
const pkg = (expo: string, vitest: string) => JSON.stringify({ dependencies: { expo }, devDependencies: { vitest }, scripts: { test: 'vitest' } });

describe('release routing: APK or OTA, never both', () => {
  let base = '', js = '', dev = '', dep = '', native = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'route-'));
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    base = commit({ 'package.json': pkg('1', '1'), 'app.json': app('1'), 'src/a.ts': 'a' }, 'base');
    js = commit({ 'src/a.ts': 'b', 'App.tsx': 'x' }, 'js');
    dev = commit({ 'package.json': pkg('1', '2') }, 'devDependencies only');
    dep = commit({ 'package.json': pkg('2', '2'), 'app.json': app('2'), 'src/a.ts': 'c' }, 'runtime dependency + runtime bump');
    native = commit({ 'app.json': app('3', 1) }, 'native config + runtime bump');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('JS-only pushes are OTA', () => {
    expect(route(base, js)).toBe('false');
  });
  it('devDependencies / scripts changes are not native (no APK for test tooling)', () => {
    expect(route(js, dev)).toBe('false');
  });
  it('runtime dependency changes are native (APK), even with JS alongside', () => {
    expect(route(dev, dep)).toBe('true');
  });
  it('native config changes are native', () => {
    expect(route(dep, native)).toBe('true');
    // Tooling-only native edits (and the icon art) rebuild the APK without a bump.
    for (const f of ['app.config.js', 'eas.json', 'src/assets/menu-bg.png']) {
      const s = commit({ [f]: String(Math.random()) }, f);
      expect(route(git('rev-parse', `${s}^`), s)).toBe('true');
    }
  });
  it('editing the workflows (APK or OTA) is not a native change', () => {
    const w = commit({ '.github/workflows/eas-build.yml': 'x', '.github/workflows/eas-update.yml': 'y', 'src/a.ts': 'w' }, 'workflow edit');
    expect(route(git('rev-parse', `${w}^`), w)).toBe('false');
  });
  it('a merge-sized push with JS + devDependencies + native goes APK only', () => {
    expect(route(base, native)).toBe('true');
  });
  it('new branch / force-push fall back to the parent commit', () => {
    expect(route('0000000000000000000000000000000000000000', js)).toBe('false');
    expect(route('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', dep)).toBe('true');
  });
  it('nothing to compare with: fail safe to native (never both)', () => {
    expect(route('', base)).toBe('true');
  });
  it('manual runs are the person\'s choice', () => {
    expect(route('', js, 'workflow_dispatch')).toBe('manual');
  });

  it('a lockfile alone is JavaScript: introducing or churning it never forces an APK', () => {
    const tip = git('rev-parse', 'HEAD');
    const lock = (expoVer: string, vitestVer: string) => JSON.stringify({ packages: {
      '': {}, 'node_modules/expo': { version: expoVer }, 'node_modules/vitest': { version: vitestVer },
      'node_modules/react-native-webview': { version: '13.0.0' },
    } });
    const l1 = commit({ 'package-lock.json': lock('51.0.1', '2.0.0') }, 'introduce the lockfile');
    expect(route(tip, l1)).toBe('false');                       // no previous lockfile: package.json decided
    const l2 = commit({ 'package-lock.json': lock('51.0.1', '2.1.0') }, 'bump a dev tool');
    expect(route(l1, l2)).toBe('false');                        // devDependency churn is OTA
  });
  it('a lockfile change that moves a native-carrying package needs an APK AND a runtime bump', () => {
    const lock = (expoVer: string) => JSON.stringify({ packages: { '': {}, 'node_modules/expo': { version: expoVer } } });
    const a = commit({ 'package-lock.json': lock('51.0.1') }, 'lock a');
    const b = commit({ 'package-lock.json': lock('51.0.2') }, 'native package moved, no runtime bump');
    expect(() => route(a, b)).toThrow();                        // refused: would reach old APKs
    const c = commit({ 'package-lock.json': lock('51.0.3'), 'app.json': app('4', 1) }, 'native package moved + bump');
    expect(route(b, c)).toBe('true');
  });
  it('native changes without a runtime bump are refused (an OTA must never reach an APK lacking its capability)', () => {
    const before = git('rev-parse', 'HEAD');
    const sameVersion = commit({ 'app.json': app('4', 99) }, 'app.json changed, expo.version not bumped');
    expect(() => route(before, sameVersion)).toThrow();
    const depNoBump = commit({ 'package.json': pkg('9', '2') }, 'runtime dependency, no bump');
    expect(() => route(sameVersion, depNoBump)).toThrow();
  });
});
