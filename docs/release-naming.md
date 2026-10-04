# Release naming and versioning

Studio convention: every public release is named **`<Product Name> v<number>`**,
with sequential integers (no semver, no codenames). For this game:

| Public name | `Where's the Bottom? v83` |
|---|---|
| Short / file name | `Wheres-the-Bottom` |
| Release title | `Where's the Bottom? v<N>` |
| Git tag | `v<N>` |
| APK filename | `Wheres-the-Bottom-v<N>.apk` |
| In-game About / Copy diagnostics | `Product: Where's the Bottom?` and `Version: v<N>` |

## Single source

`release.json` is the **only** place the public number is edited. It propagates to:

- the GitHub Release title, tag and APK filename (`scripts/release-info.mjs`, used by `.github/workflows/eas-build.yml`);
- the in-game About panel and diagnostics (`scripts/write-build-info.mjs` -> `BUILD_INFO`);
- the release notes (install steps first, provenance below).

CI refuses to publish a release if tag `v<N>` already exists, so a number is never
reused for a different binary. Failed CI runs and dev-only builds do not consume numbers.

## Public version vs internal metadata

These stay separate everywhere (diagnostics show all of them):

- **Public version** `v<N>`: what people are told to install/play.
- **OTA revision** (`OTA #N`, update ID): which over-the-air bundle is running. Several OTAs can ship under one public version.
- **Internal identifiers**: source commit SHA, Android `versionCode`, runtime version, API level, CI run number, checksums. Provenance only, never part of the public name.

## Choosing the number (history)

Inventory of this repo when the convention was adopted:

- Releases: `snow-build-106` and `snow-build-107` (same commit 8827159, ~79 MB APKs, `versionCode` 5, no update-channel header). Titled "APK build #N", where N was a CI run number, not a product version.
- OTA numbering ran `OTA #27` ... `OTA #83` (live line).
- The Android `versionCode` (5) and CI run numbers are not product versions.

`v83` was chosen because it continues the only sequence that tracks delivered
playable states (OTA #83 is the current live game). Resetting to v1 would
discard that history; using `versionCode` or a CI run would be arbitrary.
Builds 106/107 are not renumbered: they predate the convention and keep their tags.

**Next version: v84** for the next newly delivered playable build.

## Known limitation

No installable APK corresponds to v83: the live game is the installed shell plus
OTA #83, which updates itself. The first standalone file under this convention will
be `Wheres-the-Bottom-v84.apk` (or later).

Correction: earlier migration notes called "Build 13" a GitHub run number. The evidence
points to an EAS cloud build #13 signed with the EAS-managed keystore. The GitHub-built
debug-signed APKs use a different key, so Android will not update over an EAS-signed
install; the owner must uninstall (after using Settings > Back up) or keep using OTA.

## Releasing

1. Edit `publicVersion` in `release.json` (next integer).
2. Merge/push through the normal route; the APK workflow publishes `Where's the Bottom? v<N>` with `Wheres-the-Bottom-v<N>.apk`.
3. Never delete old releases or tags.
