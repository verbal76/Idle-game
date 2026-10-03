#!/usr/bin/env bash
# One-at-a-time release rule (MOBILE_GAME_DEV_RULES.md): a push may start
# the APK build OR the OTA publish, never both.
#
# Both workflows run this on the same commit range and get the same
# answer. It prints native=true when the push changes anything the APK is
# built from (native config, native folders, native-carrying dependencies)
# and native=false for JS-only pushes. eas-build.yml builds only when
# native=true; eas-update.yml publishes only when native=false.
#
# RUNTIME DISCIPLINE: an OTA must never reach an APK that lacks the native
# capability it needs. The runtime version is app.json expo.version
# (runtimeVersion policy appVersion), so a push that changes the native
# CAPABILITY set (app.json, android/, ios/, native-carrying dependencies)
# must also bump expo.version; otherwise this script fails the run. Pure
# build-tooling edits (app.config.js, eas.json, babel/metro config, the
# icon source art) rebuild the APK but don't change capability, so they
# need no bump.
#
# DEPENDENCIES: package.json `dependencies` decide, as does the resolved
# version (package-lock.json) of any package that carries native code
# (expo*, react, react-native*, @expo/*, @react-native*). Everything else
# in the lockfile (test tooling, Babylon, Vite…) is JavaScript that ships
# in the OTA, so lockfile churn alone never forces an APK.
#
# Inputs (env): GITHUB_EVENT_NAME, GITHUB_SHA, BEFORE (github.event.before),
# GITHUB_OUTPUT. Local use: BEFORE=<sha> GITHUB_SHA=<sha> bash release-route.sh
set -euo pipefail

# Set once the decision is native; BUMP_REQUIRED stays 0 for tooling-only changes.
BUMP_REQUIRED=0
BASE=""
HEAD_SHA=""

emit() {
  if [ "$1" = true ] && [ "$BUMP_REQUIRED" = 1 ] && [ -n "$BASE" ]; then
    old="$(git show "$BASE:app.json" 2>/dev/null | node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(0,"utf8")).expo.version))}catch{process.stdout.write("")}' || true)"
    new="$(git show "$HEAD_SHA:app.json" 2>/dev/null | node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(0,"utf8")).expo.version))}catch{process.stdout.write("")}' || true)"
    if [ -n "$old" ] && [ "$old" = "$new" ]; then
      echo "::error::This push changes the native build ($2) but expo.version is still $new. The runtime version follows expo.version, so without a bump an OTA built for the new native code could reach older APKs that lack it. Bump expo.version in app.json in the same push."
      echo "release-route: FAIL native change without a runtime bump ($2)"
      exit 1
    fi
  fi
  echo "native=$1" >> "${GITHUB_OUTPUT:-/dev/stdout}"
  echo "release-route: native=$1 ($2)"
}

if [ "${GITHUB_EVENT_NAME:-push}" = "workflow_dispatch" ]; then
  emit manual "started by hand: the person running it chooses"
  exit 0
fi

HEAD_SHA="${GITHUB_SHA:?GITHUB_SHA is required}"
BASE="${BEFORE:-}"
# First push of a branch (0000…) or a force-push whose old tip is gone:
# compare with the parent commit instead.
if [ -z "$BASE" ] || [ "$BASE" = "0000000000000000000000000000000000000000" ] || ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
  BASE="$(git rev-parse -q --verify "$HEAD_SHA^" 2>/dev/null || true)"
fi
if [ -z "$BASE" ]; then
  emit true "no commit to compare with: treated as native (APK only), never both"
  exit 0
fi

FILES="$(git diff --name-only "$BASE" "$HEAD_SHA")"

# Keep in sync with the `paths:` list in eas-build.yml (minus package.json
# and package-lock.json, which are checked by content below, and the
# workflow files themselves: editing a workflow doesn't change the app;
# run it by hand to try a change).
NATIVE_RE='^(app\.json|app\.config\.js|eas\.json|babel\.config\.js|metro\.config\.js|src/assets/menu-bg\.png)$|^(android|ios)/'
CAPABILITY_RE='^app\.json$|^(android|ios)/'
if printf '%s\n' "$FILES" | grep -qE "$NATIVE_RE"; then
  if printf '%s\n' "$FILES" | grep -qE "$CAPABILITY_RE"; then BUMP_REQUIRED=1; fi
  emit true "native file changed: $(printf '%s\n' "$FILES" | grep -E "$NATIVE_RE" | head -3 | tr '\n' ' ')"
  exit 0
fi

if printf '%s\n' "$FILES" | grep -qx 'package.json'; then
  pick='const p=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(JSON.stringify([p.dependencies||{},p.overrides||{},p.resolutions||{},p.expo||{}]))'
  before="$(git show "$BASE:package.json" 2>/dev/null | node -e "$pick" || echo missing)"
  after="$(git show "$HEAD_SHA:package.json" | node -e "$pick")"
  if [ "$before" != "$after" ]; then
    BUMP_REQUIRED=1
    emit true "package.json runtime dependencies changed"
    exit 0
  fi
fi

# Lockfile: only the resolved versions of native-carrying packages matter.
# With no lockfile at BASE (it is being introduced) there is nothing to
# compare, and package.json alone decided above.
if printf '%s\n' "$FILES" | grep -qx 'package-lock.json' && git cat-file -e "$BASE:package-lock.json" 2>/dev/null; then
  native_versions='
    const lock = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const re = /^(expo|expo-.+|@expo\/.+|react|react-native|react-native-.+|@react-native\/.+|@react-native-.+\/.+)$/;
    const out = {};
    for (const [k, v] of Object.entries(lock.packages || {})) {
      if (!k) continue;
      const name = k.slice(k.lastIndexOf("node_modules/") + 13);
      if (re.test(name)) out[k] = v.version || "";
    }
    process.stdout.write(JSON.stringify(Object.entries(out).sort()));'
  before="$(git show "$BASE:package-lock.json" | node -e "$native_versions")"
  after="$(git show "$HEAD_SHA:package-lock.json" | node -e "$native_versions")"
  if [ "$before" != "$after" ]; then
    BUMP_REQUIRED=1
    emit true "lockfile changed the resolved version of a native-carrying package"
    exit 0
  fi
fi

# A commit that says [build-apk] builds the APK even when nothing native
# changed (re-run a build, or build from a hold branch where manual dispatch
# is unavailable). It never skips the runtime-bump guard above.
if git log -1 --format=%B "$HEAD_SHA" | grep -qF '[build-apk]'; then
  emit true "forced by [build-apk] in the commit message"
  exit 0
fi

emit false "JS-only change"
