# OTA rollback and known-good retention

Rollback is a publish, so it is owner-authorized like any other (docs/release-authorization.md).

## What protects players automatically (expo-updates, on the device)

A bundle that fails to launch is not kept: the app falls back to the previous cached update or the bundle embedded in the APK (the emergency launch is reported in About > Copy diagnostics as "Embedded (emergency fallback)"). A new update is downloaded in the background and applied only at a safe moment (`UpdateGate`); an interrupted download leaves the running bundle untouched. These behaviours live in expo-updates and cannot be unit-tested here: confirm them on a device (docs/device-test-checklist.md).

## What protects the release (CI, before publishing)

The OTA workflow refuses code that does not contain the live update's source commit ("never go backwards"), refuses native changes since the live update, and verifies after publishing that the update server serves the new update to an installed APK's project, runtime and channel.

## Known-good record

| Public version | OTA | Source SHA | Runtime / channel |
| --- | --- | --- | --- |
| v83 | #83 | `41c8cfbbe8d747e6fce072c9e2164d0d2e7ade77` (live line tip) | 0.0.1 / preview |

Add a row for every OTA that is published (the publish log prints the update ID; record it here). Never delete the source branch or tag of a known-good update.

## Rolling back (owner action, EAS CLI or dashboard)

The publishing workflow deliberately cannot republish older code (the ancestry guard). To put the previous known-good update back in front of players:

1. Identify the previous known-good update group in the EAS dashboard (Updates, branch `preview`, filter by runtime version) or from the table above.
2. Republish that exact group to the `preview` branch with the EAS CLI (`npx eas-cli@24.10.0 update:republish`; confirm the flags with `--help`), or roll the channel back from the dashboard. This needs the owner's EAS login (`EXPO_TOKEN` is held only as a repository secret for the publish workflow).
3. Verify: a device on the channel shows the older OTA label in About > Copy diagnostics after its next safe-point update.

Players already on the bad update receive the republished (older) update as a new update; it does not remove the bad one by itself.

## Not provided

OTA authenticity beyond transport security: expo-updates code signing is not enabled (no `codeSigningCertificate` in `app.json`). Enabling it needs a signing key and a new APK (a native runtime change): RED, owner decision.
