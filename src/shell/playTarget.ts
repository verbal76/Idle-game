// What Google Play requires of a new app or update, as last verified.
// Hand-maintained on purpose: re-check the page below before trusting it
// (shell/playTarget.test.ts fails when the project's build target and this
// disagree with docs/play-readiness.md).
export const PLAY_REQUIRED_TARGET_SDK = 36;
export const PLAY_REQUIREMENT_VERIFIED_ON = '2026-10-03';
export const PLAY_REQUIREMENT_SOURCE = 'https://developer.android.com/google/play/requirements/target-sdk';
// From the same page: apps may request an extension to 2026-11-01.

/** How the native build is signed, as set by .github/workflows/eas-build.yml. */
export const SIGNING_STATE = 'Debug keystore (internal test build, not a Play release)';

export type PlayCompliance = 'yes' | 'no' | 'unverified';

export function playCompliance(targetSdk: number | null | undefined, required: number = PLAY_REQUIRED_TARGET_SDK): PlayCompliance {
  if (typeof targetSdk !== 'number' || !Number.isFinite(targetSdk)) return 'unverified';
  return targetSdk >= required ? 'yes' : 'no';
}
