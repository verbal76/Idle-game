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
