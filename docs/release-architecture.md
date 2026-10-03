# Release architecture: from internal sideload beta to store builds

Status: PREPARED, not executed. Nothing here has been done to the Play
Console, to signing credentials, or to the installed APKs. Every step that
needs the owner is marked **OWNER**.

## Where we are
- One EAS channel (`preview`) and one runtime (`0.0.1`) serve every install.
- APKs are built by `.github/workflows/eas-build.yml` (`assembleRelease`)
  and signed with Expo's **public debug keystore**.
- OTAs publish from the live branch through the gated `eas-update.yml`
  (tests, smoke, size budget, ancestry guard, delivery check).

## Target
| Concern | Beta (now) | Release |
|---|---|---|
| Signing | public debug key | **upload key** (OWNER custody) + Google **Play App Signing** |
| Artifact | APK on a GitHub Release | **AAB** (`./gradlew bundleRelease`) to Play; APK only for internal sideload |
| Testing | `preview` channel | `preview` stays for testers; **`production`** channel for store builds |
| Runtime | 0.0.1 forever | `expo.version` bumped with every native-capability change (enforced by `release-route.sh`) |
| versionCode | hand-edited (5) | monotonically increasing, bumped by the same native push (Play rejects reuse) |
| Rollback safety | ancestry guard on every OTA | same guard, per channel |

## Steps (in order)
1. **OWNER:** create the upload keystore locally (`keytool -genkeypair -v
   -storetype PKCS12 -keystore upload.jks -alias upload -keyalg RSA
   -keysize 2048 -validity 10000`). Keep it and its passwords somewhere
   safe and backed up. Never commit it. Losing it is recoverable only
   through Play's key-reset process.
2. **OWNER:** add four GitHub secrets: `ANDROID_KEYSTORE_BASE64`
   (`base64 -w0 upload.jks`), `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
3. Workflow change (prepared for the next native build, done together
   with it): decode the keystore from the secret at build time into the
   runner's temp dir, point Gradle's `signingConfigs.release` at it (the
   current "template debug keystore" step is replaced), run
   `bundleRelease` as well as `assembleRelease`, delete the file after.
   Secrets are never echoed.
4. Bump `expo.version` and `android.versionCode` in `app.json` in that same
   push (the route script enforces the version bump). Add the final icon,
   adaptive icon (safe-zone padded foreground) and native splash.
   `src/assets/menu-bg.png` is the *old* art with a black + blue-grey top
   band; the icon must come from supplied art instead.
5. **OWNER:** first install of the release-signed APK requires uninstalling
   the debug-signed one (one-time; saves are lost). Do it while the install
   base is a handful of devices.
6. Channels: build profile `production` uses
   `expo-channel-name: production`; testers' APK keeps `preview`. Publish
   production OTAs with `--branch production` after the same gates; the
   delivery check reads the channel from app.json, so it follows.
   Decide whether production uses OTA at all (store policy allows JS-only
   OTA updates; keep the ancestry guard).
7. **OWNER:** Play Console: create the app, enable Play App Signing,
   upload the first AAB to **Internal testing**, then **Closed testing**
   (3-5 external testers on varied Android hardware), fill the store
   listing, Data safety and content rating (drafts in the store folder),
   and only then request production. Production publication needs the
   owner's explicit go-ahead.

## Guards already in place (see README "Release process")
- never go backwards (ancestry), serialized publishes, size budget,
  placeholder-bundle refusal, reproducible installs (`npm ci`),
  route + runtime-bump enforcement, stale branches neutralised.
