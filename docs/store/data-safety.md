# Google Play Data Safety form - answers derived from the code

Basis: package.json, App.tsx, src/util/bugReport.ts, src/util/debug.ts, src/profiles/*, src/shell/buildInfo.ts, and the installed expo-updates 0.25.28 / expo-eas-client sources in node_modules. "Verified" means read in code. Anything else is OWNER TO CONFIRM. Google's form wording changes; re-read each question in Play Console against this table.

## 0. Findings the answers rest on

| Question | Finding | Evidence |
|---|---|---|
| Analytics SDK? | None | package.json dependencies: expo, expo-constants, expo-screen-orientation, expo-status-bar, expo-updates, react, react-native, react-native-webview. No analytics, crash-reporting, ads, attribution or billing library. `grep` of src for fetch/XMLHttpRequest/WebSocket/sendBeacon: no hits outside tests. |
| Ads SDK? | None | Same. |
| Crash reporting SDK? | None | Only a local ring buffer in src/util/debug.ts (localStorage, 60 entries). Nothing is uploaded automatically. |
| In-app purchases? | None | No billing library. Snowflakes are earned only (README, src/game/economy.ts). |
| Accounts / sign-in? | None | Profiles are local (src/profiles/IndexedDbStore.ts, DB name `boarder`, in the WebView). |
| Network calls made by the app | Only expo-updates to `https://u.expo.dev/147c7fa1-88de-4800-8c08-c5e6411f069e` (app.json `updates.url`) and downloading update assets from the URLs that manifest returns | App.tsx `runUpdateCheck` runs 1.5 s after launch, then every 90 s while the app is open, and on the manual "Check for updates" button. The native expo-updates also checks on launch (default `checkOnLaunch` ALWAYS). |
| Email | `mailto:` draft opened in the user's own email app; the app never sends anything itself | src/util/bugReport.ts `openMailto`; src/shell/navigation.ts hands the URL to the OS |
| Location / contacts / camera / mic / photos / files | Not accessed | No such code and no such permission is needed (see permissions-inventory.md) |

## 1. Does the app collect or share any of the required user data types?

**Recommended answer: Yes** (conservative), because the update check transmits an install-scoped identifier and the app can create email drafts containing diagnostics. If the owner decides these do not count, the minimal alternative is "No data collected", but that is only defensible if Expo's update request and the bug-report email are both judged out of scope. OWNER TO CONFIRM. Under-declaring is the riskier error.

What the update request actually sends (expo-updates 0.25.28, `FileDownloader.kt`):
- HTTP request to u.expo.dev, so Expo receives the device's IP address and a standard HTTP client User-Agent (inherent to any request).
- Headers: `Expo-Platform: android`, `Expo-Protocol-Version`, `Expo-API-Version`, `Expo-Updates-Environment: BARE`, `Expo-Runtime-Version` (currently 0.0.1), `expo-channel-name` (currently `preview`, from app.json), `Expo-Current-Update-ID`, `Expo-Embedded-Update-ID`, optionally `Expo-Recent-Failed-Update-IDs`.
- `EAS-Client-ID`: a random UUID the library generates on first use and stores in the app's private SharedPreferences (expo-eas-client `EASClientID.kt`). It is not an advertising ID, not the Android ID, and is removed on uninstall. It is stable for the life of the install.
- `Expo-Fatal-Error` (first 1024 chars of the previous fatal native error log) only if the previous launch hit a fatal error before the JS ran.
- No profile name, game progress, settings or account data is sent.

What a bug report / feature request email contains if the user chooses to send it (`composeUrl` in src/util/bugReport.ts):
- The text the user typed above the diagnostic block.
- App version, Android build (versionCode), runtime version, update channel, whether running OTA or embedded code, OTA name, update ID, published time, source commit, source branch (src/shell/buildInfo.ts `describeBuild`).
- `Agent: ` + the WebView `navigator.userAgent` (typically contains Android version, device model, WebView/Chrome version).
- Last 30 entries of the previous run's log and the current run's log: console.error text (truncated to 240 chars), uncaught error messages with script file:line:column, unhandled promise rejections, "session start". Timestamps are included. (src/util/debug.ts.)
- Not included: profile names, game stats, IP, location, contacts. A profile name could only appear if an error message happened to contain it. OWNER TO CONFIRM by reviewing a real draft.
- The user sees and can edit the whole draft before sending. The email is sent by the user's email app to the support address, not by this app.

## 2. Data type by data type

For each type: Collected? / Shared? / Purpose / Optional? Using Google's definitions: "collected" = transmitted off the device; "shared" = transferred to a third party, except to a service provider processing on your behalf or user-directed transfers.

| Data type | Collected | Shared | Notes |
|---|---|---|---|
| **Personal info** (name, email, user IDs, address, phone, race, politics, etc.) | No | No | The profile name is typed or randomly generated (e.g. "Stinky Donut"), max 32 chars, stored only on the device. Email address is only in the user's own email app when they choose to write to us. OWNER TO CONFIRM: if you consider the sender's email address in a received bug report to be "collected", declare Email address, optional, not shared, purpose Developer communications. This is how Google's FAQ treats user-initiated support mail in some readings and not in others. |
| **Financial info** | No | No | No purchases. |
| **Health and fitness** | No | No | |
| **Messages** (emails, SMS, in-app messages) | No | No | The app does not read messages. |
| **Photos and videos / Audio / Files and docs / Calendar / Contacts** | No | No | |
| **Location** (approximate, precise) | No | No | No location code. IP address is received by Expo's server as part of the HTTP request, but the app does no location lookup. |
| **Web browsing history / Search history** | No | No | |
| **App activity** (page views, taps, in-app search history, installed apps, other user-generated content) | No | No | Gameplay data (progress, records, settings) stays in IndexedDB on the device. Nothing uploads it. |
| **App info and performance: Crash logs** | Recommended: Yes, optional, **not shared** | No | Only (a) the `Expo-Fatal-Error` header after a native fatal error, sent to Expo's update server, and (b) the log tail in a user-sent bug email. Purpose: App functionality / Developer communications. Not used for analytics. Mark "Data collection is optional" only for the email part; the Expo header is automatic, so if you declare (a) it is not optional. OWNER TO CONFIRM how to declare. |
| **App info and performance: Diagnostics / Other app performance data** | Recommended: Yes (update request metadata + email diagnostics) | No | Runtime version, channel, update IDs, build info. Purpose: App functionality. |
| **Device or other IDs** | Recommended: **Yes** | No (Expo acts as a service provider delivering updates on the developer's behalf; OWNER TO CONFIRM against Expo's terms/DPA) | `EAS-Client-ID`, a random per-install UUID. Purpose: App functionality (update delivery). Not optional (sent automatically; the user cannot disable updates in the UI). Not used for advertising or analytics. The user-agent in a bug email also describes the device model. |

## 3. Is all of the user data collected by your app encrypted in transit?

**Yes for the automatic transfers**: `app.json updates.url` is `https://u.expo.dev/...` (TLS). The Expo template does not enable cleartext traffic for release builds (targetSdk 34 default is blocked; could not verify in a generated manifest because android/ is not in the repo, check `usesCleartextTraffic` in the merged manifest of the AAB). The bug-report email is sent by the user's email app; its transport security is up to that app, and this is user-initiated. OWNER TO CONFIRM wording; most developers answer Yes.

## 4. Do you provide a way for users to request that their data be deleted?

The app has no accounts and no server-side user profile. Facts to base the answer on:
- Game data is local. In-game: Profile picker -> edit icon -> "Delete profile" (confirmed; src/ui/ProfileSelect.ts, `ProfileService.deleteProfile`) removes that profile's save from IndexedDB. Uninstalling the app or "Clear storage" in Android settings removes all local data, including the debug log in localStorage (`wtb.debug.*`). Deleting a profile does not clear that debug log.
- Server-side: Expo holds only the update request logs (IP, headers incl. the random client ID) under Expo's own retention. The developer cannot map that ID to a person.
- Emails: bug reports/feature requests the user sent are in the developer's inbox. The developer can delete them on request to the support address.

Recommended answer: **Yes**, with the privacy policy URL describing: uninstall / delete profile for local data, and email to the support address to delete any emailed reports. If Play Console asks for a "data deletion request URL" it applies to apps with accounts; an app with no account creation is not required to provide one. OWNER TO CONFIRM.

## 5. Other Play Console declarations connected to data

- **Privacy policy URL**: required for every app on Play. None exists in the repo. **Release blocker** (see privacy-policy-requirements.md).
- **App access**: all functionality available without login. No special instructions.
- **Ads**: "No, my app does not contain ads."
- **Target audience and content**: OWNER TO DECIDE. The art is cartoon and could appeal to children. If you target or appeal to under-13s, Google's Families Policy applies (and requires, among other things, that SDKs in the app are family-compliant; Expo's update client is a risk to assess). Simplest path: select 13+ (or 18+), no child-directed claim. See content-rating.md.
- **Data backup**: Expo's Android template normally leaves `android:allowBackup` at its default of true. If the merged manifest keeps it, Android Auto Backup may copy the WebView's IndexedDB (the saves) to the user's Google account. Google says Auto Backup performed by the OS is not "collection by the app", but the privacy policy should mention it. Could not verify (no generated manifest in repo). Decide deliberately and set `android.allowBackup` in app.json. OWNER TO CONFIRM.
- **Government apps / financial / health / news / COVID declarations**: No.
- **Advertising ID declaration**: the app does not use the advertising ID and, with the permission list recommended in permissions-inventory.md, does not request `com.google.android.gms.permission.AD_ID`. If the build tool adds it via a transitive library, remove it with blockedPermissions. Could not verify; check the merged manifest.

## 6. SDK summary for Play's SDK disclosure

| Component | Role | Data leaving device |
|---|---|---|
| expo-updates 0.25.28 (+ expo-eas-client) | OTA JS updates | Update request metadata and random client ID (see section 1) |
| expo-constants, expo-screen-orientation, expo-status-bar, expo-asset, expo-file-system, expo-font, expo-keep-awake | Local functionality | None |
| react-native-webview | Renders the game | None itself. The game page has no remote content; it loads from an embedded HTML string with base URL `https://localhost/...` |
| Babylon.js (build-time, bundled) | 3D engine | None |

Not verifiable from the repo: Expo/EAS server retention and processing terms, and whether Google Play's own SDK-index flags any bundled library.
