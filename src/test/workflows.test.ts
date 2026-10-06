import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Release safety properties of the GitHub workflows. Everything here
// protects the live channel every installed APK listens to.
const update = readFileSync('.github/workflows/eas-update.yml', 'utf8');
const build = readFileSync('.github/workflows/eas-build.yml', 'utf8');

describe('release workflows (pre-release review)', () => {
  it('OTA publishing is serialised across branches and never cancelled', () => {
    expect(update).toMatch(/concurrency:\s*\n\s*group: eas-update-preview\s*\n\s*cancel-in-progress: false/);
    // APK builds: main is never cancelled (a native change must not be dropped); only the artifact-only
    // hold/candidate branches let a newer [build-apk] push supersede an older run (Actions budget policy).
    expect(build).toMatch(/cancel-in-progress: \$\{\{ github\.ref != 'refs\/heads\/main' \}\}/);
    expect(build).toMatch(/group: apk-build-\$\{\{ github\.ref \}\}/);
  });

  it('only the live lines can trigger a publish or an APK', () => {
    expect(update + build).not.toMatch(/Github-APK-Transition-snow/);
  });

  it('GitHub Releases (public distribution) come from main only; other branches leave workflow artifacts', () => {
    expect(build).toMatch(/if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'\n\s+uses: softprops\/action-gh-release/);
  });

  it('refuses to publish code older than the live update', () => {
    expect(update).toMatch(/merge-base --is-ancestor "\$LIVE" "\$GITHUB_SHA"/);
    expect(update).toMatch(/fetch-depth: 0/);
  });

  it('pins the EAS CLI (a new CLI release can change the output the publish step parses)', () => {
    expect(update).not.toMatch(/eas-cli@latest/);
    expect(update).toMatch(/eas-cli@\d+\.\d+\.\d+/);
  });

  it('keeps the page under the size budget and verifies delivery', () => {
    expect(update).toMatch(/Page size budget/);
    expect(update).toMatch(/Verify the installed APK will receive this update/);
  });

  it('a native change on a non-APK branch fails loudly instead of shipping nowhere', () => {
    expect(update).toMatch(/native-change-not-built/);
  });

  it('installs are reproducible (npm ci from the committed lockfile) and lint gates the publish', () => {
    expect(update).toMatch(/npm ci/);
    expect(update).not.toMatch(/npm install --no-audit/);
    expect(build).toMatch(/npm ci/);
    expect(update).toMatch(/npm run lint/);
  });

  it('never publishes the git-ignored placeholder bundle', () => {
    expect(update).toMatch(/__PLACEHOLDER__/);
  });

  it('Actions budget: docs never publish an OTA, branch builds need [build-apk], prune is weekly, release gates stay', () => {
    for (const p of ["'docs/**'", "'CLAUDE.md'", "'**/*.md'", "'.github/**'"]) expect(update).toContain(p);
    expect(build).toMatch(/route:[^]*?if: github\.ref == 'refs\/heads\/main' \|\| github\.event_name == 'workflow_dispatch' \|\| contains\(github\.event\.head_commit\.message, '\[build-apk\]'\)/);
    expect(build).not.toMatch(/\n {4}paths:/);                       // a path filter would let workflow/doc edits start runs
    expect(build).toContain("key: gradle-${{ hashFiles('package-lock.json') }}");
    const prune = readFileSync('.github/workflows/prune-artifacts.yml', 'utf8');
    expect(prune).toMatch(/cron: '17 6 \* \* 1'/);
    expect(prune).not.toMatch(/workflow_run/);
    // Release safety is never traded for minutes.
    expect(update).toMatch(/Never go backwards/);
    expect(update).toMatch(/Page size budget/);
    expect(build).toMatch(/inspect-apk\.py/);
    const prod = readFileSync('.github/workflows/release-android.yml', 'utf8');
    expect(prod).toMatch(/on:\s*\n\s*workflow_dispatch:/);          // production builds are manual only
    expect(prod).not.toMatch(/\n {2}push:/);
  });
});
