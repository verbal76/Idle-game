# Release naming and versioning

Studio convention: every public release is named **`<Product Name> v<number>`**,
with sequential integers (no semver, no codenames). For this game:

| Public name | `Where's the Bottom? v84` (v83 = OTA #83, the live game before this system existed) |
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

- Releases: `snow-build-106` and `snow-build-107` (~79 MB APKs, `versionCode` 5). Titled "APK build #N", where N was a CI run number, not a product version. Provenance caveat: both release TAGS point at `main` (8827159, where the release was created), but the APKs were built from the transition branch: run 106 from 86b534d and run 107 from bc1fb81 (the commit that bakes the `preview` update channel into the manifest). So build 107 DOES receive OTAs; build 106 does not. Both are signed with the Expo template debug key (certificate SHA-256 fac61745...3b9c).
- OTA numbering ran `OTA #27` ... `OTA #83` (live line).
- The Android `versionCode` (5) and CI run numbers are not product versions.

`v83` names the live OTA #83 state, retroactively (no installable file exists for it). `v84` is the first delivery that carries this naming system (its release.json), and was chosen because it continues the only sequence that tracks delivered
playable states (OTA #83 is the current live game). Resetting to v1 would
discard that history; using `versionCode` or a CI run would be arbitrary.
Builds 106/107 are not renumbered: they predate the convention and keep their tags.

**This branch ships as v84.** Any later delivery must bump `release.json` first (the APK workflow refuses a tag that already exists). Next after that: v85.

## Known limitation

No installable APK corresponds to v83: the live game is the installed shell plus
OTA #83, which updates itself. The first standalone file under this convention will
be `Wheres-the-Bottom-v84.apk` (or later).

Correction: earlier notes called "Build 13" a GitHub run number. It is not one: run 13 of the
APK workflow was a skipped OTA-publish run, and no `snow-build-13` release exists. What
"Build 13" is on the owner's phone cannot be proven from the repository. The harmless way to
find out is to try installing a debug-signed APK over it: Android refuses a mismatched
signature and leaves the installed app and its data untouched (never uninstall to "fix" it).

## Releasing

1. Edit `publicVersion` in `release.json` (next integer).
2. Merge/push through the normal route; the APK workflow publishes `Where's the Bottom? v<N>` with `Wheres-the-Bottom-v<N>.apk`.
3. Never delete old releases or tags.
