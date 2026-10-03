import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Release safety properties of the GitHub workflows. Everything here
// protects the live channel every installed APK listens to.
const update = readFileSync('.github/workflows/eas-update.yml', 'utf8');
const build = readFileSync('.github/workflows/eas-build.yml', 'utf8');

describe('release workflows (pre-release review)', () => {
  it('OTA publishing is serialised across branches and never cancelled', () => {
    expect(update).toMatch(/concurrency:\s*\n\s*group: eas-update-preview\s*\n\s*cancel-in-progress: false/);
    expect(build).toMatch(/cancel-in-progress: false/);
    expect(build).not.toMatch(/group: [^\n]*github\.ref/);
  });

  it('only the live lines can trigger a publish or an APK', () => {
    expect(update + build).not.toMatch(/Github-APK-Transition-snow/);
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
});
