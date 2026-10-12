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

  it('GitHub Releases (public distribution) only come from the owner-authorized release job, never from a push', () => {
    expect(build).toMatch(/release:[^]*?if: always\(\) && github\.event_name == 'workflow_dispatch' && inputs\.destination == 'github_releases' && inputs\.confirm == 'publish-release'[^]*?environment: production-release/);
    expect(build).toMatch(/uses: softprops\/action-gh-release/);
    expect(build.match(/softprops\/action-gh-release/g)).toHaveLength(1);
  });

  it('refuses to publish code older than the live update', () => {
    expect(update).toMatch(/merge-base --is-ancestor "\$LIVE" "\$APPROVED_SHA"/);
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

  it('a native change since the live update cannot ship as an OTA (checked against the live update, not a push range)', () => {
    expect(update).toMatch(/release-route\.sh/);
    expect(update).toMatch(/cannot ship as an OTA/);
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

  it('Actions budget: builds need [build-apk] or a dispatch, prune is weekly, release gates stay', () => {
    expect(build).toMatch(/route:[^]*?if: github\.event_name == 'workflow_dispatch' \|\| contains\(github\.event\.head_commit\.message, '\[build-apk\]'\)/);
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

  it('the coordinated build workflow exposes the standard inputs and never releases a partial build', () => {
    const on = /\non:\n([^]*?)\n\n/.exec(build)![1]!;
    for (const k of ['platform:', 'source_sha:', 'build_number:', 'destination:', 'confirm:']) expect(on).toContain(k);
    expect(on).toMatch(/options: \[android, windows, linux, all\]/);
    expect(on).toMatch(/options: \[local_only, github_releases\]/);
    const desktop = build.slice(build.indexOf('\n  desktop:'), build.indexOf('\n  release:'));
    expect(desktop).toMatch(/if: github\.event_name == 'workflow_dispatch' && inputs\.platform != 'android'/);
    expect(desktop).toMatch(/node scripts\/build\.mjs --platform "\$\{\{ matrix\.platform \}\}" --source-sha "\$SOURCE_SHA"/);
    expect(desktop).toMatch(/ref: \$\{\{ inputs\.source_sha \}\}/);
    const release = build.slice(build.indexOf('\n  release:'));
    expect(release).toMatch(/android\|all\) \[ "\$BUILD" = success \]/);
    expect(release).toMatch(/windows\|linux\|all\) \[ "\$DESKTOP" = success \]/);
    expect(release).toMatch(/make-release-manifest\.mjs --merge/);
    expect(release).toMatch(/sha256sum -c checksums\.sha256/);
    expect(release).toMatch(/fail_on_unmatched_files: true/);
    expect(release).toMatch(/already exists/);                          // a build number is never reused
  });
});

