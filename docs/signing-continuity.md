# Signing continuity: can a new APK install over the owner's current app?

Android updates an installed app in place only when the new APK is signed by the SAME
certificate (and has the same package id and a higher versionCode). A different
certificate is refused ("App not installed ... conflicts with an existing package");
the installed app and its data are left untouched. Only an UNINSTALL deletes saves,
so nobody should ever uninstall to get past that refusal without a backup first.

## What the repository proves

| Build family | How it was built | Signing certificate |
| --- | --- | --- |
| GitHub-hosted Gradle builds: runs 106 to 115 (`snow-build-106/107` and the migration stages 109 to 114) | `expo prebuild` + `assembleRelease` on the runner | Expo template **debug** key: CN=Android Debug, SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` (printed by `apksigner` in the CI log of run 114) |
| EAS cloud builds, 2026-05-03 to 05-04 (`[build]` commits on `claude/android-snowboarding-game-UHUPI`, runs 1 to 55) | `eas build` in the cloud | **EAS-managed keystore** (held in the owner's Expo account; not in this repository) |
| `eas build --local` builds, 2026-05-08 (main, runs 97 to 102, before commit 86b534d) | local EAS build using EAS credentials | **EAS-managed keystore** (same account) |

Evidence for the last two rows: the header comment of `86b534d` ("This is a DIFFERENT key from the
EAS-managed keystore that signed previous cloud builds") and the workflow history.

## What the owner's phone is running

The owner calls the installed native baseline **"Build 13"**. That is not a GitHub run: run 13 of the
APK workflow was a skipped OTA-publish run and no `snow-build-13` tag or release exists; the only releases are
`snow-build-106` and `-107`. The pre-transition EAS builds are the only family that fits, and "13" is
consistent with the number of EAS build attempts in the first days of May (about nine successful `[build]` runs plus
failed attempts). **Most likely the installed app is an EAS-built APK, signed with the EAS-managed key.**
That has not been proven: the key lives in the owner's Expo account, and nothing in the repository records
which APK was installed. (About > Copy diagnostics reports versionCode 5 for the installed shell; `snow-build-106/107` also
carry versionCode 5, so versionCode alone does not distinguish them.)

## Refined evidence (versionCode timeline, read-only)

`app.json` `android.versionCode` over time: 1 (2026-05-03 first EAS cloud build), 2 (05-04), 3 (through 05-07/08), 5 (05-08 16:21, commit `09e708d`). The installed shell reports versionCode **5**, so it was built from `09e708d` or later. The APK builds from that point on are:

| Build | When | How | Key |
| --- | --- | --- | --- |
| Actions runs 101 and 102 (`09e708d`, `8827159`) | 2026-05-08 | `eas build` (EAS cloud, `eas-cli build --platform android`) | EAS-managed keystore |
| Actions run 106 (`86b534d`) | 2026-05-08 | GitHub Gradle | debug key; no channel header, so it would never receive OTAs |
| Actions run 107 (`bc1fb81`, release `snow-build-107`) | 2026-05-09 | GitHub Gradle | debug key, with the channel header |

The installed app receives OTAs, which rules out build 106. That leaves the EAS cloud builds 101/102 (most likely: "Build 13" fits the EAS dashboard build counter, not any GitHub number) or build 107. Application ID (`com.hotatticgames.snow`), runtime (0.0.1) and channel (`preview`) are identical for all of them, so they prove nothing about the key. **The signing certificate of the installed app is still not proven.**

The one decisive, risk-free fact is the owner's EAS Android keystore fingerprint (EAS dashboard > project > Credentials > Android > Keystore, or `eas credentials`; read-only, shows SHA-256, never the key). If it is NOT `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`, no GitHub-built APK can update the installed app. In that case the way to keep the installation and its saves is to build the migration APK with EAS cloud (`eas build`, which signs with that same keystore and costs EAS credits, not GitHub minutes) instead of the debug key. If it matches, the GitHub APK installs in place.

## Consequences

- If the phone is EAS-signed: **every GitHub-built APK, including migration build 114 and the v85 candidate,
  will be refused as an in-place update.** The refusal is harmless (nothing is removed). Moving over requires one
  uninstall + reinstall, which erases local saves unless they were backed up first.
- If the phone is one of the debug-signed APKs (106/107): the candidate installs in place and keeps saves.
- Either way the OTA path is unaffected: OTAs match project, runtime version and channel, never the signing key.

## Safe path (no risk to saves)

1. Ship the in-app **Back up & restore** (hold-save-export, already in the candidate) over the air to the CURRENT
   runtime (0.0.1) first, as its own OTA (v84). That is JavaScript only and needs no reinstall.
2. Owner exports a backup (Settings > Back up) and keeps the text somewhere off the phone. Verify with "Check backup".
3. Only then install the candidate APK (v85). Outcomes: it updates in place (same key, data kept), or Android
   refuses it (different key). On a refusal, the owner may uninstall and install the APK, then Restore.
4. Nobody is ever asked to uninstall before step 2 is done.

Smallest physical diagnostic that is risk-free even without step 1: tap-install the APK over the current app and
read the result. "Updated" means same key. "App not installed / conflicts with existing package" means a different
key and NOTHING was changed. Do not uninstall.

## Production key and Play

- Production uses a fresh upload key (owner custody). `release-android.yml` fails closed without it and refuses the
  debug certificate (`scripts/release-signing.mjs`).
- Sideloaded debug/EAS installs will not update to a Play-installed build either (Play re-signs with its own app signing
  key). Reusing the EAS-managed key as Play's app signing key would preserve continuity with an EAS-signed phone, but only
  for a brand-new app listing and only with the owner's keystore; it is an OWNER decision and only matters if more than the
  owner's own phone has the old install. Backup/Restore makes it unnecessary for a single tester.

## Fingerprint verification procedure (owner steps; no keys, no passwords, no tokens)

Update compatibility is **not claimed** by this repository until the three public values below have been
compared. Fingerprints are public SHA-256 digests of a certificate; pasting them into chat or a script is
safe. Never paste a keystore, its password or an EAS token.

| # | Fingerprint | Where to get it (read-only) |
| --- | --- | --- |
| 1 | **Installed app's signing certificate** (the one that decides whether an update installs) | On a computer with Android platform-tools and build-tools, USB debugging on: `adb shell pm path com.hotatticgames.snow` (prints `package:/data/app/.../base.apk`), `adb pull <that path> installed.apk`, then `apksigner verify --print-certs installed.apk` (or `keytool -printcert -jarfile installed.apk`). Use the line `Signer #1 certificate SHA-256 digest`. This reads the APK already on the phone: nothing is changed. |
| 2 | **Candidate APK's signing certificate** | `apksigner verify --print-certs "<candidate>.apk"` on the downloaded artifact (a hosted build also prints it in the log). A debug-signed build shows `fac61745dc09...33b9c` (the public Android/Expo debug key). |
| 3 | **EAS-managed keystore** (explains where #1 came from) | expo.dev > the project > Credentials > Android > the build credentials > **SHA-256 fingerprint**; or `eas credentials` (Android, read-only listing). Shows fingerprints only, never the key. |
| 4 | **Play App Signing** (only later, for a Play listing) | Play Console > the app > Test and release > App integrity > App signing: "App signing key certificate" and "Upload key certificate" SHA-256. Play re-signs with its own key, so a sideloaded APK will not update to a Play install regardless of #1 to #3. |

Compare with `node scripts/compare-fingerprints.mjs <#1> <#2> [<#3>]` (accepts `SHA256: AB:CD:...`, lowercase
hex, with or without colons; exits 0 only when #1 equals #2). Reading the result:

* **#1 == #2**: Android will accept the candidate as an in-place update (same package id
  `com.hotatticgames.snow`, higher versionCode). Saves are kept.
* **#1 != #2**: Android refuses the candidate; nothing is changed or deleted. Back up first (Settings > Back up
  & restore), and only then decide whether to uninstall. **Do not uninstall before a verified backup.**
* **#1 == #3**: the installed app is EAS-signed; a GitHub-built debug-signed APK will be refused, and a
  continuity build has to be produced with the EAS keystore (EAS cloud) or accepted as a one-time reinstall.

Findings recorded so far (non-secret metadata only): the debug certificate fingerprint above is the only
candidate-side value known from the repository (`scripts/release-signing.mjs`, CI log of run 114); #1 and #3
have **not** been read by this project. No keystore, password or token has been requested, generated,
rotated or committed in this round, and no signing configuration was changed.
