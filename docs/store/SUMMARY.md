# Play Store readiness: index and open items

Product: Where's the Bottom? (com.hotatticgames.snow, Hot Attic Games). Repo read-only; nothing in the repo was changed. Generated 2026-10-03 from the code at the current HEAD.

## Files

| File | Contents |
|---|---|
| listing.md | Title, short and full description (about 2,200 chars), first-release notes, category and tags |
| data-safety.md | Data Safety answers question by question, with the evidence from code and the update library |
| privacy-policy-requirements.md | Facts a privacy policy must state, plus a plain-language draft with markers |
| permissions-inventory.md | Predicted manifest permissions, recommended `blockedPermissions` |
| content-rating.md | IARC inputs and the target-audience decision |
| assets-checklist.md | Required graphics, what exists, what is missing, icon problems, art and model provenance |
| release-track-plan.md | AAB, signing, versionCode, EAS Update channels, internal -> closed -> production |

## RELEASE BLOCKERS

1. **Music provenance and licence are undocumented.** The three tracks (`src/assets/music/Powder_Parade.mp3`, `Trail_Snack_Parade.mp3`, `Fresh_Powder_Run.mp3`) each carry an embedded ID3 comment `made with suno; created=2026-05-07...; id=<uuid>`. The repo has no README, credits, licence or receipt for them (searched all files). Commercial rights over Suno output depend on the Suno plan active when each track was created (as I understand Suno's terms, free-plan output is non-commercial; paid-plan output is licensed for commercial use; confirm against Suno's current terms and keep the account export/receipt). Owner must prove the plan, record it, or replace the tracks with licensed or self-made music before upload. Do not describe the music as "original" or "royalty-free" in the listing until confirmed.
2. **Target API level.** Expo SDK 51 / React Native 0.74.5 builds target API 34. Play requires API 36 for new apps since 2026-08-31, and 16 KB page-size support for new apps targeting Android 15+. Needs an SDK upgrade to Expo 54 or later and regression testing. This is the largest piece of engineering work.
3. **Signing.** The release APK is signed with the public Expo debug keystore; the pipeline builds an APK, not an AAB. Needs an owner-held upload keystore, Play App Signing, and `./gradlew bundleRelease` (release-track-plan.md section 4).
4. **No privacy policy URL** (required by Play, and the app links to none). Draft in privacy-policy-requirements.md.
5. **Store graphics missing/unusable.** No feature graphic, no screenshots; the current icon has baked-in black corners and a blue-grey frame band, and the adaptive icon has no safe-zone padding.
6. **Update stream not separated for production.** One hard-coded `preview` channel and runtime `0.0.1`; every push to `main` would hit store users. Needs a production channel, version bump and promotion step.
7. **Closed-testing rule.** If the developer account is personal and was created after 2023-11-13, production needs 12 testers opted in for 14 days (not 3 to 5).
8. **Third-party art and model records.** Menu/splash art and gear icon are described only as "supplied"; Kenney models are CC0 by Kenney's site but not recorded; rocks/flowers/props STL provenance unknown. Fonts are OFL but their licence texts do not ship in the app (add a Credits screen).

## OWNER TO CONFIRM (collected)

- Legal developer name, country, account type (personal vs organization), and account creation date.
- Public support email (the code uses hotatticgames@gmail.com in src/util/bugReport.ts).
- Privacy policy hosting URL, effective date, jurisdiction-specific rights text (GDPR/UK GDPR/CCPA).
- Target audience: 13+ vs including children (Families Policy).
- Whether to declare, in Data Safety: Device or other IDs (random `EAS-Client-ID` sent to u.expo.dev), crash logs / diagnostics (update metadata, `Expo-Fatal-Error`, bug-report email contents), and whether Expo counts as a service provider, not a third party. Review Expo's terms and DPA and retention.
- `android:allowBackup` setting and what to say about Android Auto Backup.
- Merged-manifest check once an AAB exists: permissions, `usesCleartextTraffic`, `AD_ID`, `allowBackup`, targetSdk.
- That blocking READ/WRITE_EXTERNAL_STORAGE and SYSTEM_ALERT_WINDOW does not break music (test on device).
- "No ads, no in-app purchases" remains true at launch.
- Offline play works on a fresh install in airplane mode.
- Actual AAB size.
- Whether a diagnostic email can include a profile name (only if a log message contains it; review a real draft).
- Licence/source of: music, menu-bg/splash-bg/settings-gear art, Kenney packs, STL rocks/flowers/props.
- Whether to add an in-app privacy-policy link and credits (small JS change; note `https:` links currently load inside the game WebView, src/shell/navigation.ts).

## Not verifiable from the repo

- The generated AndroidManifest (android/ is not committed; Expo SDK 51 template defaults recalled from knowledge, not read).
- Expo's server-side handling of update requests.
- Current Play Console form wording, graphic limits and policy dates (web-checked on 2026-10-03; links in release-track-plan.md).
- Any Play Console account state.

## Smaller observations

- `src/__generated__/build-info.ts` is stale (branch from May, versionCode 3); the app reads versionCode at runtime from the native config, so the in-app value is right, but README mentions `src/version.ts` which does not exist, and eas-build.yml greps it (falls back to "unknown").
- `eas.json` production profile (`buildType: apk`, `channel: production`) is not used by the real pipeline and conflicts with app.json's hard-coded channel.
- `dist/index.html` is 9.39 MB, close to the ~10 MB WebView Binder limit noted in MusicPlayer.ts; avoid inlining more assets.
- `.gitignore` has no `*.jks` / `*.keystore` entries.
