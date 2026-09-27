// Manually-bumped version strings surfaced in the About panel so the
// rider can confirm at a glance that a fresh OTA / APK actually
// reached the device.
//
// BUILD_VERSION:
//   Bump only when shipping a new APK (rare — requires a full
//   eas-build cycle, kicked by editing any file in the
//   eas-build.yml `paths` list, or by Run Workflow with the
//   build profile of your choice).
//   Format: "build #N - short description".
//
// OTA_VERSION:
//   Bump every time you push a JS-only change that should land via
//   OTA. Format: "OTA #N - short description". Lets you correlate
//   "what I just shipped" with "what the device says it has" without
//   reading commit hashes.
//
// Both strings appear on the About panel and in the Copy text
// alongside the existing commit/built/runtime fields, so a paste
// in a bug report identifies the exact build the user is on.

export const BUILD_VERSION = "build #4 - re-encoded icon (Sharp/libvips compat fix)";
export const OTA_VERSION   = 'OTA #40 - upgrade double-tap can no longer overspend';
