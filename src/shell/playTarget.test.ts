import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUILD_INFO } from '../__generated__/build-info';
import { PLAY_REQUIRED_TARGET_SDK, SIGNING_STATE, playCompliance } from './playTarget';

describe('Play target / signing facts stay honest', () => {
  it('playCompliance', () => {
    expect(playCompliance(34)).toBe('no');
    expect(playCompliance(PLAY_REQUIRED_TARGET_SDK)).toBe('yes');
    expect(playCompliance(null)).toBe('unverified');
    expect(playCompliance(undefined)).toBe('unverified');
    expect(playCompliance(Number.NaN)).toBe('unverified');
  });

  it('the build target comes from the framework template, and the docs record the same compliance', () => {
    const gradle = readFileSync('node_modules/react-native/template/android/build.gradle', 'utf8');
    const target = Number(gradle.match(/targetSdkVersion\s*=\s*(\d+)/)?.[1]);
    expect(Number.isFinite(target)).toBe(true);
    // Placeholder (fresh clone) leaves it null until web:build runs.
    if (BUILD_INFO.targetSdk !== null) expect(BUILD_INFO.targetSdk).toBe(target);
    const doc = readFileSync('docs/play-readiness.md', 'utf8');
    expect(doc).toContain(`Required target API: ${PLAY_REQUIRED_TARGET_SDK}`);
    expect(doc).toContain(`Build target API: ${target}`);
    expect(doc).toContain(`Play API compliant: ${playCompliance(target) === 'yes' ? 'YES' : 'NO'}`);
  });

  it('the signing statement matches the build workflow (debug keystore)', () => {
    const wf = readFileSync('.github/workflows/eas-build.yml', 'utf8');
    expect(SIGNING_STATE).toMatch(/Debug keystore/);
    expect(wf).toMatch(/debug keystore/i);
    expect(wf).not.toMatch(/secrets\.[A-Z_]*(KEYSTORE|STORE_PASSWORD)/);   // no production signing wired in
  });
});
