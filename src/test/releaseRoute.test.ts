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
const pkg = (expo: string, vitest: string) => JSON.stringify({ dependencies: { expo }, devDependencies: { vitest }, scripts: { test: 'vitest' } });

describe('release routing: APK or OTA, never both', () => {
  let base = '', js = '', dev = '', dep = '', native = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'route-'));
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    base = commit({ 'package.json': pkg('1', '1'), 'app.json': '{}', 'src/a.ts': 'a' }, 'base');
    js = commit({ 'src/a.ts': 'b', 'App.tsx': 'x' }, 'js');
    dev = commit({ 'package.json': pkg('1', '2') }, 'devDependencies only');
    dep = commit({ 'package.json': pkg('2', '2'), 'src/a.ts': 'c' }, 'runtime dependency');
    native = commit({ 'app.json': '{"x":1}' }, 'native config');
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
    for (const f of ['app.config.js', 'eas.json', 'android/x.gradle', 'src/assets/menu-bg.png']) {
      const s = commit({ [f]: String(Math.random()) }, f);
      expect(route(git('rev-parse', `${s}^`), s)).toBe('true');
    }
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
});
