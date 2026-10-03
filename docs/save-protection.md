# Save protection: where the saves live and how to carry them across a signing change

## Where player data lives (VERIFIED from the code)

- Everything meaningful is in ONE IndexedDB database named `boarder` (version 1, `src/profiles/IndexedDbStore.ts`): store `profiles` (key `id`, one row per profile) and store `meta` (key `activeProfileId`). Nothing else is persisted (no localStorage save, no files). The profile shape is `SaveData` (name, currency, upgrades, stats, milestones, daily, settings) with `schemaVersion` 2; `src/profiles/migrate.ts` upgrades any older shape on load and never resets earned values.
- The WebView page is loaded with `source={{ html, baseUrl: 'https://localhost/<update id>/' }}` (App.tsx). The storage origin is therefore `https://localhost` (the path does not matter), the same for every OTA and every build, so OTAs never change where the data is.
- On the phone the data is in the app's private WebView profile (`/data/data/com.hotatticgames.snow/app_webview/`).

## What keeps the data, what loses it

| Event | Data |
| --- | --- |
| OTA update | Kept (same origin, same app). |
| New APK installed over the old one, SAME package ID and SAME signing key | Kept (an in-place update). Migration test builds use the existing debug keystore for exactly this reason. |
| Expo / React Native / react-native-webview upgrade (the API 36 migration APK, docs/api36-migration.md) | Expected to be kept: the origin (`https://localhost`) comes from `baseUrl` in JS, `package.json`/app code never touches the WebView profile directory, and the package ID and debug certificate (SHA-256 `fac61745dc09…3b9c`) are unchanged. NOT proven until a migrated APK is installed over the current one on a real phone (PHYSICAL TEST REQUIRED): install over the top, open it, check the profiles. |
| Android System WebView update | Kept (Android's own storage format). |
| Different signing key (debug to upload/Play key) | LOST. Android refuses an in-place update with a different signature, so the old app must be uninstalled, and uninstalling deletes the app's data. Android Auto Backup might restore it on some phones (the app does not turn it off), but that is not something to rely on: size-limited, account-dependent, and unverified here. |
| Uninstall / "clear data" | LOST. |

## Back up & restore (IMPLEMENTED on hold branch claude/hold-save-export; not shipped)

Settings → Back up & restore saves.

- Back up: "Copy backup" puts every profile on the clipboard as plain text (a versioned, checksummed JSON envelope; an unbanked run in progress is left out). If the WebView refuses clipboard access, the text is shown selected so it can be copied by hand. An "E-mail it to myself" link appears when the backup is small enough for a mailto link.
- Restore: paste the text, "Check backup". The whole thing is validated first (format, version, checksum, every profile through the game's own migration and sanitiser). Junk, truncated or edited text is refused with a reason and nothing is touched. A valid backup shows a preview row per profile (what is in it, what it would replace on this phone, and a warning where this phone has MORE progress). Only the Restore / "Replace anyway" button writes. Profiles on the phone that are not in the backup are kept.
- Tests: 10 backup unit tests, 3 service tests, and a smoke step that does the round trip against the real IndexedDB.

IMPORTANT: this reaches the owner's current install only as an OTA on runtime 0.0.1, i.e. after the held branches go to the live branch. Until then the installed OTA #83 build has no export.

## Owner procedure before any signing change

1. After OTA #83 testing ends and the held work is released as an OTA, open Settings → Back up & restore saves → Copy backup.
2. Paste it somewhere that is not this phone's app data (Notes synced to your account, or an e-mail to yourself).
3. Verify it: paste it into the Restore box and press "Check backup". It should list every profile with its snowflakes and runs. Do not press Restore.
4. Repeat just before installing the first build signed with a different key. Install it (uninstall the old one first), open Settings → Back up & restore saves, paste, Check, Restore.
5. Keep the text until the new build has been played for a while.

## Not covered

- A device that is lost or wiped without a backup made beforehand has no recovery: there is no cloud save.
- Restoring does not carry the unbanked "run in progress", by design.
