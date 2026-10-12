import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyApprovedSource } from '../../scripts/verify-approved-source.mjs';
import { buildManifest } from '../../scripts/make-release-manifest.mjs';

// Nothing publishes without explicit owner authorization. Static analysis of every workflow plus
// negative tests of the exact-SHA verification (throwaway git repos only).
const dir = '.github/workflows';
const files = readdirSync(dir).filter(f => f.endsWith('.yml'));
const text = (f: string) => readFileSync(join(dir, f), 'utf8');
/** The text of the top-level `on:` block. */
const onBlock = (t: string) => { const m = /\non:\n((?:[ \t].*\n|\n)*)/.exec(`\n${t}`); return m ? m[1]! : ''; };
const triggers = (t: string) => [...onBlock(t).matchAll(/^ {2}([a-z_]+):/gm)].map(m => m[1]);

const PUBLISHING = /eas-cli@[\d.]+ update|channel:edit|softprops\/action-gh-release|bundleRelease/;

describe('no automatic publishing path', () => {
  it('the OTA and signed-release workflows have no automatic trigger at all', () => {
    expect(triggers(text('eas-update.yml'))).toEqual(['workflow_dispatch']);
    expect(triggers(text('release-android.yml'))).toEqual(['workflow_dispatch']);
  });

  it('no workflow can be started by a tag, a release event, a chained workflow, a reusable call or an external dispatch', () => {
    for (const f of files) {
      const t = text(f);
      expect(onBlock(t), f).not.toMatch(/^\s*(tags|tags-ignore|release|workflow_run|workflow_call|repository_dispatch|pull_request_target|issue_comment|deployment|registry_package):/m);
    }
  });

  it('every workflow that can publish needs the production-release environment AND a typed confirmation, and none is push/PR triggered', () => {
    const publishing = files.filter(f => PUBLISHING.test(text(f)));
    expect(publishing.sort()).toEqual(['eas-build.yml', 'eas-update.yml', 'release-android.yml']);
    for (const f of publishing) {
      const t = text(f);
      expect(t, f).toMatch(/environment: production-release/);
      expect(t, f).toMatch(/inputs\.confirm/);
      expect(t, f).toMatch(/verify-approved-source\.mjs/);
    }
    // eas-build may BUILD on push, but the publishing job is dispatch-only.
    const build = text('eas-build.yml');
    const releaseJob = build.slice(build.indexOf('\n  release:'));
    expect(releaseJob).toMatch(/if: always\(\) && github\.event_name == 'workflow_dispatch' && inputs\.destination == 'github_releases'/);
    expect(build.slice(0, build.indexOf('\n  release:'))).not.toMatch(PUBLISHING);
  });

  it('publishing steps only ever use the approved SHA, never the moving ref', () => {
    const upd = text('eas-update.yml');
    expect(upd).toMatch(/ref: \$\{\{ inputs\.source_sha \}\}/);
    expect(upd).toMatch(/export OTA_COMMIT="\$APPROVED_SHA"/);
    expect(upd).not.toMatch(/\$GITHUB_SHA|github\.sha|GITHUB_REF_NAME/);
    const rel = text('release-android.yml');
    expect(rel).toMatch(/ref: \$\{\{ inputs\.source_sha \}\}/);
    expect(rel).not.toMatch(/github\.sha/);
    const build = text('eas-build.yml');
    expect(build).toMatch(/target_commitish: \$\{\{ inputs\.source_sha \}\}/);
  });

  it('a version bump, docs change or merge cannot publish: no push/PR trigger exists on the publishers', () => {
    for (const f of ['eas-update.yml', 'release-android.yml']) expect(triggers(text(f)), f).not.toContain('push');
    expect(text('eas-build.yml')).toMatch(/contains\(github\.event\.head_commit\.message, '\[build-apk\]'\)/);
  });

  it('the existing OTA safeguards are intact: runtime/native check, never-go-backwards, delivery verification, size budget', () => {
    const upd = text('eas-update.yml');
    for (const re of [/Never go backwards/, /merge-base --is-ancestor "\$LIVE" "\$APPROVED_SHA"/, /cannot ship as an OTA/, /Verify the installed APK will receive this update/, /Page size budget/, /npm run test:smoke/, /eas-cli@24\.10\.0 update/, /channel:edit preview/]) expect(upd).toMatch(re);
  });
});

describe('least-privilege secrets', () => {
  it('signing secrets are visible only to the validate, re-decode and Gradle steps, never job-wide', () => {
    const t = text('release-android.yml');
    const beforeSteps = t.slice(0, t.indexOf('\n    steps:'));
    expect(beforeSteps.replace(/^#.*$/gm, '')).not.toMatch(/secrets\./);
    const steps = t.slice(t.indexOf('\n    steps:')).split(/\n {6}- /).slice(1);
    const withSecrets = steps.filter(s => /secrets\./.test(s)).map(s => /name: ([^\n]+)/.exec(s)?.[1] ?? '?');
    expect(withSecrets).toEqual(['Validate the signing secrets and keystore (fail closed)', 'Re-decode the keystore for signing (secrets scoped to this step and the build)', 'Build signed AAB and APK']);
    const gradle = steps.find(s => s.startsWith('name: Build signed AAB'))!;
    expect(gradle).not.toMatch(/KEYSTORE_B64/);                    // the raw keystore is not needed by Gradle
  });

  it('workflow token permissions are read-only except the release job and the artifact pruner', () => {
    for (const f of files) {
      const t = text(f);
      const top = /\npermissions:\n((?: {2}.*\n|#.*\n)+)/.exec(`\n${t}`)?.[1] ?? '';
      expect(top, f).toMatch(/(contents: read|actions: write)/);
      expect(top, f).not.toMatch(/contents: write/);
    }
    expect(text('eas-build.yml').match(/contents: write/g)).toHaveLength(1);   // only the release job
  });
});

const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8' }).trim();

describe('exact approved-source verification', () => {
  function setup() {
    const d = mkdtempSync(join(tmpdir(), 'wtb-appr-'));
    git(d, 'init', '-q', '-b', 'line');
    const commit = (f: string) => { writeFileSync(join(d, f), f); git(d, 'add', '-A'); git(d, 'commit', '-q', '-m', f); return git(d, 'rev-parse', 'HEAD'); };
    const base = commit('base');
    const approved = commit('approved');
    return { d, commit, base, approved };
  }
  const v = (d: string, base: string, approvedSha: string) => verifyApprovedSource({ approvedSha, baselineSha: base, authoritativeLine: 'line', lineRef: 'refs/heads/line', cwd: d });

  it('accepts exactly the checked-out, integrated commit', () => {
    const { d, base, approved } = setup();
    expect(v(d, base, approved).ok).toBe(true);
  });

  it('rejects a malformed, abbreviated, uppercase or empty SHA', () => {
    const { d, base, approved } = setup();
    for (const bad of [approved.slice(0, 7), approved.toUpperCase(), '', 'main', approved + '0', undefined as unknown as string]) expect(v(d, base, bad).ok, String(bad)).toBe(false);
  });

  it('rejects a SHA that does not exist in the checkout', () => {
    const { d, base } = setup();
    expect(v(d, base, 'f'.repeat(40)).reason).toMatch(/does not exist/);
  });

  it('rejects when HEAD is not the approved commit (the branch moved, or the wrong ref was checked out)', () => {
    const { d, base, approved, commit } = setup();
    commit('moved-on');
    const r = v(d, base, approved);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/is not the approved commit/);
  });

  it('rejects a descendant that was never integrated into the authoritative line', () => {
    const { d, base, commit } = setup();
    git(d, 'checkout', '-q', '-b', 'candidate');
    const unmerged = commit('candidate-only');
    const r = v(d, base, unmerged);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not on the authoritative line/);
  });

  it('rejects a commit that does not contain the authoritative baseline (divergent history)', () => {
    const { d, base, commit } = setup();
    git(d, 'checkout', '-q', '--orphan', 'other');
    git(d, 'rm', '-rf', '-q', '.');
    const stranger = commit('stranger');
    const r = v(d, base, stranger);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/divergent or outdated/);
  });

  it('the provenance manifest refuses a source that disagrees with the checkout', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'wtb-art-')), 'a.bin'); writeFileSync(f, 'x');
    const head = git('.', 'rev-parse', 'HEAD');
    const ok = buildManifest({ platform: 'android', signing: 'debug', artifacts: [f], env: { SOURCE_SHA: head } as unknown as NodeJS.ProcessEnv });
    expect(ok.sourceSha).toBe(head);
    expect(() => buildManifest({ platform: 'android', signing: 'debug', artifacts: [f], env: { SOURCE_SHA: 'c'.repeat(40) } as unknown as NodeJS.ProcessEnv })).toThrow(/disagrees with the approved source/);
    // SOURCE_SHA outranks the moving GITHUB_SHA
    expect(buildManifest({ platform: 'android', signing: 'debug', artifacts: [f], env: { SOURCE_SHA: head, GITHUB_SHA: 'd'.repeat(40) } as unknown as NodeJS.ProcessEnv }).sourceSha).toBe(head);
  });
});
