#!/usr/bin/env bash
# Official Google archives, pinned after verification against the Android repository metadata.
set -euo pipefail
: "${ANDROID_HOME:?Set ANDROID_HOME}"
download_dir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/azadi-android-sdk"
mkdir -p "$download_dir" "$ANDROID_HOME/platforms" "$ANDROID_HOME/build-tools" "$ANDROID_HOME/ndk"
install_archive() {
  local name="$1" hash="$2" source_dir="$3" destination="$4"
  if [ -f "$destination/source.properties" ]; then return; fi
  local archive="$download_dir/$name" extracted
  if [ ! -f "$archive" ]; then
    curl --fail --location --retry 3 --output "$archive" "https://dl.google.com/android/repository/$name"
  fi
  printf '%s  %s\n' "$hash" "$archive" | sha256sum --check -
  extracted="$(mktemp -d "$download_dir/extract.XXXXXX")"
  unzip -q "$archive" -d "$extracted"
  mv "$extracted/$source_dir" "$destination"
  rmdir "$extracted"
}
install_archive platform-35_r02.zip 0988cacad01b38a18a47bac14a0695f246bc76c1b06c0eeb8eb0dc825ab0c8e0 android-15 "$ANDROID_HOME/platforms/android-35"
install_archive build-tools_r35_linux.zip bd3a4966912eb8b30ed0d00b0cda6b6543b949d5ffe00bea54c04c81e1561d88 android-15 "$ANDROID_HOME/build-tools/35.0.0"
install_archive android-ndk-r28b-linux.zip e9f2759862cecfd48c20bbb7d8cfedbb020f4d91b5f78d9a2fc106f7db3c27ed android-ndk-r28b "$ANDROID_HOME/ndk/28.1.13356709"
