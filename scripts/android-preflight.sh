#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"

print_section() {
  printf '\n== %s ==\n' "$1"
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    printf 'missing:%s\n' "$name"
    return 1
  fi
  printf 'found:%s:%s\n' "$name" "$(command -v "$name")"
}

print_section "Java"
if command -v java >/dev/null 2>&1; then
  java -version
else
  printf 'missing:java\n'
  printf 'install: brew install --cask temurin\n'
  exit 2
fi

print_section "Gradle Wrapper"
if [ ! -x "$ANDROID_DIR/gradlew" ]; then
  printf 'missing:%s\n' "$ANDROID_DIR/gradlew"
  exit 3
fi
(cd "$ANDROID_DIR" && ./gradlew -version)

print_section "Android SDK"
if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
  printf 'missing:ANDROID_HOME or ANDROID_SDK_ROOT\n'
  printf 'set one of them to your Android SDK path, for example $HOME/Library/Android/sdk\n'
  exit 4
fi
printf 'ANDROID_HOME=%s\n' "${ANDROID_HOME:-}"
printf 'ANDROID_SDK_ROOT=%s\n' "${ANDROID_SDK_ROOT:-}"

print_section "adb"
require_command adb
adb version

print_section "Connected Devices"
adb devices

print_section "Project Commands"
printf 'next:npm test\n'
printf 'next:npm run build\n'
printf 'next:npx cap sync android\n'
printf 'next:cd android && ./gradlew :app:compileDebugJavaWithJavac\n'
