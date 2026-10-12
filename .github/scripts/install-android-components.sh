#!/usr/bin/env bash
# Installs the exact Android SDK components the generated android/ project asks for
# (shared by eas-build.yml and release-android.yml; run after `expo prebuild`).
set -euo pipefail
SDKM="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
[ -x "$SDKM" ] || SDKM=$(ls "$ANDROID_HOME"/cmdline-tools/*/bin/sdkmanager | tail -1)
# compileSdk is pinned in app.json (gradle.properties); build-tools and the
# NDK come from android/build.gradle (SDK 52) or React Native's version
# catalog (SDK 53+).
CAT=node_modules/react-native/gradle/libs.versions.toml
CS=$(grep -E '^android.compileSdkVersion=' android/gradle.properties | cut -d= -f2 || true)
[ -n "$CS" ] || CS=$(grep -E '^compileSdk *=' "$CAT" | grep -oE '[0-9]+' | head -1)
BT=$(grep -hoE "buildToolsVersion = findProperty\('android.buildToolsVersion'\) \?: '[0-9.]+'" android/build.gradle 2>/dev/null | grep -oE "[0-9]+\.[0-9.]+" || true)
[ -n "$BT" ] || BT=$(grep -E '^buildTools *=' "$CAT" 2>/dev/null | grep -oE '[0-9]+\.[0-9.]+' | head -1 || true)
NDK=$(grep -hoE 'ndkVersion = "[0-9.]+"' android/build.gradle 2>/dev/null | grep -oE "[0-9][0-9.]+" || true)
[ -n "$NDK" ] || NDK=$(grep -E '^ndkVersion *=' "$CAT" 2>/dev/null | grep -oE '[0-9][0-9.]+' | head -1 || true)
echo "compileSdk=$CS buildTools=$BT ndk=$NDK"
echo "toolchain: agp=$(grep -E '^agp *=' "$CAT" | grep -oE '[0-9][0-9.]+' | head -1) kotlin=$(grep -E '^kotlin *=' "$CAT" | grep -oE '[0-9][0-9.]+' | head -1) $(grep distributionUrl android/gradle/wrapper/gradle-wrapper.properties | grep -oE 'gradle-[0-9.]+') java=$(java -version 2>&1 | head -1)"
yes | "$SDKM" --licenses > /dev/null || true
PKGS=("platforms;android-$CS" "platform-tools")
[ -n "$BT" ] && PKGS+=("build-tools;$BT")
[ -n "$NDK" ] && PKGS+=("ndk;$NDK")
"$SDKM" --install "${PKGS[@]}"
