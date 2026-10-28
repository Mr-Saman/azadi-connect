#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
./gradlew --no-daemon connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.allowVpnTest=true
mkdir -p ../artifacts/android-screenshots
adb pull /sdcard/Android/data/org.azadi.connect/files/screenshots ../artifacts/android-screenshots
