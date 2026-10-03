# Release track plan: internal -> closed -> production

No secret or key material appears here. Owner steps are marked OWNER. Policy facts from the web were checked on 2026-10-03 (links at the end); re-check Play Console help before acting, they change.

## 1. Current state (from the repo)

| Item | Today | Problem for the store |
|---|---|---|
| Artifact | APK from `./gradlew assembleRelease` (.github/workflows/eas-build.yml), uploaded to a GitHub Release | Play requires an **AAB** for new apps |
| Signing | Expo template **debug keystore** (the workflow says so: "signs with the Expo-template's debug keystore"). That keystore is public and the same for every Expo project | Not acceptable: anyone can produce an APK that Android treats as an update of your app. The store build must use an owner-held upload key, with Play App Signing |
| `expo.version` / runtime | `0.0.1`; `runtimeVersion: {policy: 'appVersion'}` so runtime = `0.0.1` | See section 6 |
| `versionCode` | 5 in app.json (`src/__generated__/build-info.ts` still shows 3; it is a stale generated file) | See section 5 |
| Update channel | `expo.updates.requestHeaders.expo-channel-name = preview`, hard-coded in app.json. The OTA workflow publishes to EAS branch `preview` on every push to `main` | The same stream would reach store users. See section 6 |
| `eas.json` | `production` profile has `channel: production` but `buildType: apk`, and the real pipeline does not use EAS Build at all (it runs `expo prebuild` + Gradle in GitHub Actions). The `channel` in eas.json therefore has no effect on those builds; app.json's header wins | Misleading config; must be reconciled |
| Target API | Expo SDK 51 / RN 0.74.5 -> `targetSdkVersion 34` (read from react-native's manifest in node_modules) | **Release blocker**: Play requires 36 for new apps from 2026-08-31 (today is 2026-10-03) |
| 16 KB page size | RN 0.74-era native libraries are 4 KB aligned | Play requires 16 KB support for new apps/updates targeting Android 15+ since 2025-11-01. **Blocker** with the SDK; solved by a newer SDK |
| Page-bundle size | `dist/index.html` is 9.39 MB; the CI budget is 10.5 MB, but MusicPlayer.ts notes the Binder channel carrying the HTML to the WebView fails above roughly 10 MB | Not a store rule, but a stability risk right at the limit on real devices. Do not add more inline art without moving it out of the HTML |

## 2. Blockers before any Play upload

1. **Target API 36** (Android 16). Expo SDK 54 / React Native 0.81 sets compile and target SDK 36 and ships 16 KB-aligned libraries. This is an SDK upgrade (Expo 51 -> 54: several majors, React 18 -> 19.1, react-native-webview and expo-* bumps, new architecture default, edge-to-edge forced on Android). It is a native, APK-class change, needs full regression (WebView + audio + orientation + OTA). Alternatives (overriding targetSdk with expo-build-properties on SDK 51) are not recommended: the old native code has not been tested against API 36 behaviour and the 16 KB issue remains. Check Play Console's current deadline or request the extension offered (the extension window mentioned in Google's help text was to Nov 1, 2026) only if the owner needs time.
2. **Upload keystore and Play App Signing** (section 4).
3. **AAB build** (section 3).
4. **Privacy policy URL** (privacy-policy-requirements.md), **Data Safety** (data-safety.md), **content rating** (content-rating.md), **target audience** declaration.
5. **Store graphics** (assets-checklist.md), including a fixed icon.
6. **Music provenance** (see SUMMARY.md): the three MP3s carry an ID3 comment "made with suno" and no licence record exists in the repo. Do not ship until the owner documents the Suno plan/terms in force on the creation date (files created 2026-05-07).
7. **Separate update channel for store builds** (section 6).

## 3. AAB vs APK

- Play requires an Android App Bundle for new apps. APKs are for sideloading/GitHub testers and cannot be uploaded to production.
- Build with Gradle (keeps the existing `expo prebuild` workflow): in `android/` run `./gradlew bundleRelease`. Output: `android/app/build/outputs/bundle/release/app-release.aab`. The JS bundle is embedded (release variant, same as assembleRelease today).
- Alternative: EAS Build with the `production` profile changed to `"android": {"buildType": "app-bundle"}` and EAS-managed credentials. This also gives `autoIncrement`. The project already has `eas.json appVersionSource: local`, so the version must be edited in app.json either way.
- Keep the sideload **APK** pipeline for ad-hoc testers (it must be signed with the owner's key too; see below, otherwise a debug-signed APK can never be updated to the Play-signed app, and testers lose the local save when switching, since saves live in the WebView's IndexedDB in app storage).
- Expect the store AAB to be about 20 MB or less (9.4 MB inline HTML plus 9.4 MB MP3s plus the runtime). Play download size will be smaller after compression and splitting. Well under the 200 MB base limit. OWNER TO CONFIRM actual size.

## 4. Signing: owner steps (exact process, no keys here)

1. OWNER generates an **upload keystore** on their own machine, once, with the JDK `keytool` (`keytool -genkeypair -v -keystore <file>.jks -alias <alias> -keyalg RSA -keysize 2048 -validity 10000`). Choose a strong password. Do not do this on a shared/CI machine and never commit the file.
2. OWNER stores the keystore file and the passwords in at least two private places (password manager plus an offline backup). Record the alias. The keystore is the owner's custody, not the agent's, and not in the repo (.gitignore should also list `*.jks` and `*.keystore`: not currently listed, add it).
3. OWNER enrols in **Play App Signing** at the first upload (default for new apps with AABs). Google holds the app-signing key; the owner's key is only the upload key. If the upload key is ever lost, the owner can request an upload key reset in Play Console, which is why Play App Signing is mandatory here, not optional.
4. For CI: OWNER adds four GitHub Actions repository secrets: keystore file (base64-encoded), keystore password, key alias, key password. The workflow decodes the file at build time, injects a `signingConfigs.release` into `android/app/build.gradle` after `expo prebuild` (a small script step, or an Expo config plugin) and points `buildTypes.release.signingConfig` at it. Remove the reliance on the debug keystore for the store workflow. Use an environment with required reviewers for the store-release workflow so the key is not usable by every push to `main`. No secret must be echoed in logs.
5. Verify the AAB is not debug-signed: `jarsigner -verify -verbose -certs app-release.aab` should show the owner's certificate, not "CN=Android Debug".
6. Existing testers on debug-signed APKs must uninstall before installing a Play-signed build (different signature), which wipes local profiles. Say so in the tester invite.
7. Play Console also shows the app-signing certificate fingerprint; save it in a private note.

## 5. versionCode / version policy

- `android.versionCode` (app.json) is a strictly increasing integer. **Every upload to any Play track needs a higher number than any previously uploaded**, including internal tests, and numbers can never be reused or decreased.
- Suggested: keep the sideload line below the store line. The sideload APKs used 1-5, so start the store line at a clear base (for example 100) and increment by 1 on every AAB upload. Record each in a release log (not just build-info.ts; its generated value is stale).
- `expo.version` is the human-facing version name (`versionName`) and, with `policy: appVersion`, the runtime version. Use semantic names: first store build `1.0.0`. Bump `version` whenever native code, permissions, SDK, icon or plugins change (also what MOBILE_GAME_DEV_RULES.md and README already say), so an OTA built for new native code can never be offered to an older native binary.
- app.json is the single source (`appVersionSource: local`). Gradle reads it through prebuild, so no other file needs the number.

## 6. EAS Update: channel and runtime policy

Facts: runtime = `expo.version` (policy `appVersion`, today `0.0.1`). One channel, `preview`, hard-coded in app.json; the OTA workflow publishes branch `preview` on every push to `main`; installed apps check on launch, every 90 s while open, and on demand (App.tsx), applying updates only between runs.

Risks for a store release:
- Without changes, **every push to `main` goes live to all Play users** within about 90 seconds of them opening the app, with the same runtime. A broken push is a production incident. The "never go backwards" guard and delivery check help but are not a staged rollout.
- Sideloaded 0.0.1 testers and store users would share a runtime and channel.

Recommended policy (all of this is native or workflow work; do it before the first store build):
1. **Bump `expo.version` to 1.0.0** for the first store build so it gets its own runtime and sideload 0.0.1 APKs are not offered store-line updates (they will be stranded on 0.0.1; publish a last OTA to them first if you want to tell them to move).
2. **Two channels / two EAS branches**: `preview` (internal and closed testers) and `production` (store). Make the channel a build-time value: in `app.config.js`, set `updates.requestHeaders['expo-channel-name']` from an env var (for example `EAS_CHANNEL`, default `preview`) and set it to `production` in the store workflow. (The comment in app.config.js says it only changes `extra`; this would be a deliberate native-affecting change.) Internal and closed track builds can use `preview`; the build submitted for production must use `production`. Alternatively use one binary and promote with `eas channel:edit`, but then testers and users share builds, which is weaker.
3. **Promote, don't push straight to production**: main -> `preview` branch automatically (today's behaviour), then a manual workflow_dispatch "Promote to production" that republishes a specific tested update to the `production` branch (`eas update:republish`). Keep a rollback step (`eas update:rollback` or republish the previous good update ID) documented in the README.
4. **Runtime discipline**: an OTA is only for JS/asset changes. Anything in the APK-required list in MOBILE_GAME_DEV_RULES.md (permissions, SDK, plugins, icon) means a new store version, bump `version`, new AAB, then publish OTAs for the new runtime.
5. **Play policy**: updating interpreted JS via OTA is allowed, but it must not change the app's declared purpose or break policies. In particular do not add ads, billing, new data collection or new permissions via OTA without updating Data Safety and the privacy policy first. OWNER TO CONFIRM against current Play policy text.
6. **Delivery check** in eas-update.yml already queries the update server with the runtime and channel from app.json. With the env-var channel, run that check once per channel.

## 7. Tracks

| Step | What | Gate to move on |
|---|---|---|
| **A. Internal testing** | Create the app in Play Console (title, default language, app/game, free). Upload the first signed AAB to Internal testing; add up to 100 testers by email list (the owner and a few friends). Available within minutes, no review wait for most accounts. Complete App content declarations now (privacy policy URL, Ads, App access, content rating, target audience, Data safety, government/financial/health). Read the **pre-launch report** (Firebase Test Lab crashes, accessibility, device coverage) | AAB installs from the Play link on 2+ real devices, game runs, saves persist across updates, OTA check works, no crashes in the pre-launch report, merged-manifest permissions match permissions-inventory.md |
| **B. Closed testing** | Create a closed track, add testers by email list or Google Group. **Important for new accounts**: for personal developer accounts created after 2023-11-13, Google requires a closed test with **at least 12 testers opted in continuously for 14 days** before you can apply for production access (reduced from 20 testers in Dec 2024). A plan with only 3 to 5 testers will **not** unlock production for such an account. Organization accounts are exempt. Internal testing does not count. OWNER TO CONFIRM account type and creation date in Play Console -> Dashboard. If personal: recruit 12+ real testers (friends, family, communities), keep them opted in 14 consecutive days, and collect feedback (the in-game bug report email works for this). Then click "Apply for production access" and answer the questions | Counts met (if required), crash-free, feedback addressed |
| **C. Production** | Create a production release from the tested AAB (or a newer versionCode), choose countries, fill release notes (listing.md), **staged rollout starting at 5 to 20 percent**, monitor Android vitals (crashes/ANRs) and reviews, then raise to 100 percent. First review can take a few days. Keep the OTA channel `production` pointed at the same runtime | Stable vitals for a few days at the first stage |

Also before A: set up the store listing page text and graphics (needed for closed/production, not for internal), choose the developer name and contact email (public), and confirm payment-profile requirements are not needed (free app, no IAP).

## 8. Owner checklist, in order

1. Decide target audience (13+ vs including children) and confirm account type (personal vs organization).
2. Resolve music provenance (SUMMARY.md); resolve art/model licence records.
3. Host the privacy policy; confirm contact email.
4. Upgrade the project to a target-API-36 Expo SDK (54 or later) and regression-test; apply `blockedPermissions`; fix the icons; set `version` 1.0.0, `versionCode` base, channel env var.
5. Generate and safeguard the upload keystore; add CI secrets; add the bundleRelease workflow.
6. Create the Play Console app; upload AAB to Internal testing; fill App content; use the pre-launch report.
7. Closed testing for 14 days with 12+ testers if required; apply for production.
8. Production staged rollout; OTA only through promoted `production` updates.

## Sources (checked 2026-10-03)

- Target API level requirements: https://support.google.com/googleplay/android-developer/answer/11926878
- New personal account testing requirement: https://support.google.com/googleplay/android-developer/answer/14151465
- 16 KB page size: https://android-developers.googleblog.com/2025/05/prepare-play-apps-for-devices-with-16kb-page-size.html
- Expo SDK 54 (RN 0.81, API 36): https://expo.dev/changelog/sdk-54
