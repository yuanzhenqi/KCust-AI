#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
PACKAGE_NAME="com.kcust.ai"
APK_PATH="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"

if [ -z "${JAVA_HOME:-}" ]; then
  if [ -d "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" ]; then
    export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
  elif JAVA_HOME_CANDIDATE="$(/usr/libexec/java_home -v 21 2>/dev/null)"; then
    export JAVA_HOME="$JAVA_HOME_CANDIDATE"
  else
    printf 'JDK 21 is required for this Capacitor Android build.\n'
    printf 'Install with: brew install openjdk@21\n'
    exit 3
  fi
fi
export PATH="$JAVA_HOME/bin:$PATH"

JAVAC_VERSION="$(javac -version 2>&1 | awk '{print $2}')"
JAVAC_MAJOR="${JAVAC_VERSION%%.*}"
if [ "$JAVAC_MAJOR" -lt 21 ]; then
  printf 'JDK 21 or newer is required; found javac %s at %s/bin.\n' "$JAVAC_VERSION" "$JAVA_HOME"
  exit 4
fi

if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
  if [ -d "/opt/homebrew/share/android-commandlinetools" ]; then
    export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
    export ANDROID_SDK_ROOT="$ANDROID_HOME"
  else
    printf 'Android SDK is required. Set ANDROID_HOME or ANDROID_SDK_ROOT.\n'
    exit 5
  fi
elif [ -z "${ANDROID_HOME:-}" ]; then
  export ANDROID_HOME="$ANDROID_SDK_ROOT"
elif [ -z "${ANDROID_SDK_ROOT:-}" ]; then
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
fi
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

cd "$ROOT_DIR"
npm run build
npx cap sync android

cd "$ANDROID_DIR"
./gradlew :app:assembleDebug

if ! adb get-state >/dev/null 2>&1; then
  printf 'No Android device or emulator is connected.\n'
  printf 'Start an emulator or connect a device with USB debugging enabled.\n'
  exit 2
fi

adb install -r "$APK_PATH"
adb shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n "$PACKAGE_NAME/.MainActivity"

printf '\n== Package Permissions ==\n'
adb shell dumpsys package "$PACKAGE_NAME" | grep -E "SYSTEM_ALERT_WINDOW|RECORD_AUDIO|READ_CALENDAR|WRITE_CALENDAR|POST_NOTIFICATIONS" || true

printf '\n== Recent KCUST Logs ==\n'
adb logcat -d -t 200 | grep -E "KCUST|Capacitor|Overlay|Speech|Calendar|SecureKeys" || true

printf '\nSmoke install and launch completed.\n'
