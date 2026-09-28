#!/usr/bin/env bash
# One-at-a-time release rule (MOBILE_GAME_DEV_RULES.md): a push may start
# the APK build OR the OTA publish, never both.
#
# Both workflows run this on the same commit range and get the same
# answer. It prints native=true when the push changes anything the APK is
# built from (native config, native folders, or runtime `dependencies` in
# package.json) and native=false for JS-only pushes. eas-build.yml builds
# only when native=true; eas-update.yml publishes only when native=false.
#
# GitHub path filters can't do this alone: package.json holds both
# runtime dependencies (native) and devDependencies/scripts (not).
#
# Inputs (env): GITHUB_EVENT_NAME, GITHUB_SHA, BEFORE (github.event.before),
# GITHUB_OUTPUT. Local use: BEFORE=<sha> GITHUB_SHA=<sha> bash release-route.sh
set -euo pipefail

emit() {
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

# Keep in sync with the `paths:` list in eas-build.yml (minus package.json,
# which is checked by content below).
NATIVE_RE='^(app\.json|app\.config\.js|eas\.json|babel\.config\.js|metro\.config\.js|package-lock\.json|src/assets/menu-bg\.png|\.github/workflows/eas-build\.yml)$|^(android|ios)/'
if printf '%s\n' "$FILES" | grep -qE "$NATIVE_RE"; then
  emit true "native file changed: $(printf '%s\n' "$FILES" | grep -E "$NATIVE_RE" | head -3 | tr '\n' ' ')"
  exit 0
fi

if printf '%s\n' "$FILES" | grep -qx 'package.json'; then
  pick='const p=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(JSON.stringify([p.dependencies||{},p.overrides||{},p.resolutions||{},p.expo||{}]))'
  before="$(git show "$BASE:package.json" 2>/dev/null | node -e "$pick" || echo missing)"
  after="$(git show "$HEAD_SHA:package.json" | node -e "$pick")"
  if [ "$before" != "$after" ]; then
    emit true "package.json runtime dependencies changed"
    exit 0
  fi
fi

emit false "JS-only change"
