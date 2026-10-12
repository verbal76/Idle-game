import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkReleaseSource } from '../../scripts/assert-release-source.mjs';
import { checkLedger, inventory } from '../../scripts/branch-inventory.mjs';
import { buildManifest, checkParity } from '../../scripts/make-release-manifest.mjs';

// One authoritative product history, every platform from the same SHA, no unaccounted branches
// (CLAUDE.md, docs/architecture.md). Throwaway git repos only: nothing here touches this checkout's refs.
const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8' }).trim();
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'wtb-git-'));
  git(d, 'init', '-q', '-b', 'main');
  const commit = (file: string, text = file) => { writeFileSync(join(d, file), text); git(d, 'add', '-A'); git(d, 'commit', '-q', '-m', file); return git(d, 'rev-parse', 'HEAD'); };
  return { d, commit };
}

describe('release source selection', () => {
  it('accepts a head that contains the authoritative baseline, refuses a divergent branch', () => {
    const { d, commit } = repo();
    const base = commit('a');
    commit('b');
    git(d, 'checkout', '-q', '-b', 'old', base);
    const stale = commit('stale-only');
    git(d, 'checkout', '-q', 'main');
    expect(checkReleaseSource({ baselineSha: base, head: 'main', cwd: d }).ok).toBe(true);
    git(d, 'checkout', '-q', '-b', 'divergent', git(d, 'rev-list', '--max-parents=0', 'HEAD'));
    commit('unrelated');
    const r = checkReleaseSource({ baselineSha: stale, head: 'divergent', cwd: d });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/divergent or outdated/);
  });

  it('refuses a malformed baseline and a baseline that is not in the checkout', () => {
    const { d, commit } = repo(); commit('a');
    expect(checkReleaseSource({ baselineSha: 'nope', cwd: d }).ok).toBe(false);
    expect(checkReleaseSource({ baselineSha: 'f'.repeat(40), cwd: d }).reason).toMatch(/not in this checkout/);
  });

  it('this repository: authoritative.json names a baseline that HEAD contains', () => {
    const { baselineSha } = JSON.parse(readFileSync('authoritative.json', 'utf8'));
    const r = checkReleaseSource({ baselineSha });
    expect(r.ok, r.reason).toBe(true);
  });
});

describe('branch inventory and recovery ledger', () => {
  it('counts only unique work: a cherry-pick is not missing work, an unaccounted branch fails the check', () => {
    const { d, commit } = repo();
    commit('base');
    git(d, 'checkout', '-q', '-b', 'feature');
    const f = commit('feature-file');
    git(d, 'checkout', '-q', 'main');
    git(d, 'cherry-pick', f);                                       // the same patch lands on main
    git(d, 'checkout', '-q', '-b', 'abandoned', 'HEAD~1');
    commit('lost-work');
    git(d, 'checkout', '-q', 'main');
    const rows = inventory({ auth: 'refs/heads/main', refPrefix: 'refs/heads/', cwd: d });
    const byName: Record<string, { unique: number; tip: string }> = Object.fromEntries(rows.map((r: { name: string; unique: number; tip: string }) => [r.name, r]));
    expect(byName['feature'].unique).toBe(0);
    expect(byName['abandoned'].unique).toBe(1);
    const opts = { refPrefix: 'refs/heads/', cwd: d };
    expect(checkLedger(rows, { branches: [] }, opts).join()).toMatch(/abandoned: 1 unique commit/);
    expect(checkLedger(rows, { branches: [{ branch: 'abandoned', status: 'intentional', acceptedTip: byName['abandoned'].tip }] }, opts)).toEqual([]);
    git(d, 'checkout', '-q', 'abandoned'); commit('more-lost-work'); git(d, 'checkout', '-q', 'main');
    const moved = inventory({ auth: 'refs/heads/main', refPrefix: 'refs/heads/', cwd: d });
    expect(checkLedger(moved, { branches: [{ branch: 'abandoned', status: 'intentional', acceptedTip: byName['abandoned'].tip }] }, opts).join()).toMatch(/tip moved/);
  });

  it('an in-integration branch must stay contained in the integration branch', () => {
    const { d, commit } = repo();
    commit('base');
    git(d, 'checkout', '-q', '-b', 'integration');
    git(d, 'checkout', '-q', '-b', 'hold');
    commit('held-work');
    git(d, 'checkout', '-q', 'integration'); git(d, 'merge', '-q', '--no-edit', 'hold');
    const opts = { refPrefix: 'refs/heads/', cwd: d };
    const ledger = { branches: [{ branch: 'hold', status: 'in-integration', containedIn: 'integration' }, { branch: 'integration', status: 'integration-branch' }] };
    expect(checkLedger(inventory({ auth: 'refs/heads/main', ...opts }), ledger, opts)).toEqual([]);
    git(d, 'checkout', '-q', 'hold'); commit('new-unreviewed');
    expect(checkLedger(inventory({ auth: 'refs/heads/main', ...opts }), ledger, opts).join()).toMatch(/no longer contained in integration/);
  });

  it('the committed ledger is well formed and covers the authoritative line', () => {
    const ledger = JSON.parse(readFileSync('docs/branch-ledger.json', 'utf8'));
    expect(ledger.authoritativeLine).toBe(JSON.parse(readFileSync('authoritative.json', 'utf8')).authoritativeLine);
    for (const e of ledger.branches) {
      expect(typeof e.branch).toBe('string');
      expect(typeof e.note).toBe('string');
      expect(Boolean(e.containedIn || e.acceptedTip || e.status === 'integration-branch'), e.branch).toBe(true);
    }
  });
});

describe('release manifest and platform parity', () => {
  const sha = 'a'.repeat(40);
  const mk = (platform: string, over: Record<string, string> = {}) => {
    const f = join(mkdtempSync(join(tmpdir(), 'wtb-art-')), `art-${platform}.bin`);
    writeFileSync(f, `bytes-${platform}`);
    return buildManifest({ platform, signing: 'debug', artifacts: [f], env: { GITHUB_SHA: sha, GITHUB_REF_NAME: 'main', GITHUB_RUN_NUMBER: '7', GITHUB_RUN_ID: '9', ...over } as unknown as NodeJS.ProcessEnv, now: new Date('2026-10-12T00:00:00Z') });
  };

  it('records source SHA/ref, public version, platform, configuration, runtime, toolchain and artifact hashes', () => {
    const m = mk('android');
    expect(m.sourceSha).toBe(sha);
    expect(m.sourceRef).toBe('main');
    expect(m.publicVersion).toMatch(/^v\d+$/);
    expect(m.platform).toBe('android');
    expect(m.packageId).toBe('com.hotatticgames.snow');
    expect(m.runtimeVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(m.versionCode).toBe(7);
    expect(m.buildConfiguration).toEqual({ variant: 'release', signing: 'debug' });
    expect(m.toolchain.expo).toMatch(/^\d/);
    expect(m.artifacts[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(m.builtAt).toBe('2026-10-12T00:00:00.000Z');
  });

  it('parity: every platform of one release shares the source SHA and public version', () => {
    expect(checkParity([mk('android'), mk('windows')])).toEqual([]);
    expect(checkParity([mk('android'), mk('windows', { GITHUB_SHA: 'b'.repeat(40) })]).join()).toMatch(/source bbbbbbb != android aaaaaaa/);
    expect(checkParity([]).length).toBe(1);
  });

  it('refuses a manifest without a SHA, platform or signing mode', () => {
    expect(() => mk('android', { GITHUB_SHA: 'short' })).toThrow(/SHA/);
    expect(() => buildManifest({ platform: '', signing: 'debug', artifacts: ['x'] })).toThrow(/platform/);
    expect(() => buildManifest({ platform: 'android', signing: 'maybe', artifacts: ['x'] })).toThrow(/signing/);
  });
});

describe('CI cannot pass by silently skipping', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  it('no skipped / focused tests are committed (conditional runIf is allowed only for tools CI provides)', () => {
    const bad = walk('src').filter(f => f.endsWith('.test.ts')).filter(f => f !== join('src', 'test', 'singleSource.test.ts'))
      .filter(f => /\b(it|test|describe)\.(skip|only|todo)\(|\bx(it|describe)\(|\bfit\(|\bfdescribe\(/.test(readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });
  it('the keytool-dependent signing tests really run in CI (Java is installed there)', () => {
    const hasKeytool = spawnSync('keytool', ['-help'], { stdio: 'ignore' }).error === undefined;
    if (process.env.CI) expect(hasKeytool).toBe(true);
    else expect(typeof hasKeytool).toBe('boolean');
  });
});

describe('the policy is durable and discoverable', () => {
  it('CLAUDE.md states the single-history rule and points at the enforcing files, which exist', () => {
    const claude = readFileSync('CLAUDE.md', 'utf8');
    expect(claude).toMatch(/ONE authoritative history/);
    for (const f of ['docs/architecture.md', 'docs/branch-ledger.md', 'docs/branch-ledger.json', 'authoritative.json', 'scripts/assert-release-source.mjs', 'scripts/make-release-manifest.mjs', 'scripts/branch-inventory.mjs']) {
      expect(readFileSync(f, 'utf8').length, f).toBeGreaterThan(50);
    }
  });

  it('release workflows select their source explicitly: full history, baseline assertion, manifest', () => {
    for (const f of ['.github/workflows/eas-build.yml', '.github/workflows/release-android.yml']) {
      const w = readFileSync(f, 'utf8');
      expect(w, f).toMatch(/fetch-depth: 0/);
      expect(w, f).toMatch(/node scripts\/(assert-release-source|verify-approved-source)\.mjs/);
      expect(w, f).toMatch(/make-release-manifest\.mjs/);
    }
  });
});

