# Android Native Device Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Plan A by proving the Android native loop can compile, install, launch, and pass device QA for overlay, speech, calendar, notifications, and secure key storage.

**Architecture:** Keep the current React/Capacitor app and native Java plugins. Add small repeatable verification scripts and a QA evidence log, then run Gradle and device checks. Any source fixes must stay limited to native bridge reliability and permission fallback behavior, not new CRM features.

**Tech Stack:** React, TypeScript, Vite, Capacitor 8, Android Gradle project, Android Java plugins, adb, Android Emulator or physical Android device, Vitest.

---

## File Structure

- Create `scripts/android-preflight.sh`: checks JDK, Gradle wrapper, Android SDK, adb, and device availability.
- Create `scripts/android-device-smoke.sh`: builds debug APK, installs it, launches the app, and captures focused logcat output.
- Modify `README.md`: add exact Android toolchain setup and verification commands.
- Modify `docs/android-qa.md`: add an evidence table for device runs, permission results, and known environment blockers.
- Modify native Java plugin files only if Gradle compile or device QA exposes a concrete failure:
  - `android/app/src/main/java/com/kcust/ai/OverlayPlugin.java`
  - `android/app/src/main/java/com/kcust/ai/SpeechPlugin.java`
  - `android/app/src/main/java/com/kcust/ai/CalendarPlugin.java`
  - `android/app/src/main/java/com/kcust/ai/SecureKeysPlugin.java`
  - `android/app/src/main/java/com/kcust/ai/FloatingAssistantService.java`
- Do not change customer CRUD, Agent behavior, relationship graph, or SQLite storage in this plan.

---

### Task 1: Add Android Toolchain Preflight Script

**Files:**
- Create: `scripts/android-preflight.sh`
- Modify: `README.md`
- Modify: `docs/android-qa.md`

- [ ] **Step 1: Verify the script is missing**

Run:

```bash
test -x scripts/android-preflight.sh
```

Expected: command exits non-zero because the script does not exist yet.

- [ ] **Step 2: Create `scripts/android-preflight.sh`**

Add this exact file:

```bash
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
```

- [ ] **Step 3: Make the script executable**

Run:

```bash
chmod +x scripts/android-preflight.sh
```

Expected: command exits 0.

- [ ] **Step 4: Syntax-check the script**

Run:

```bash
bash -n scripts/android-preflight.sh
```

Expected: command exits 0.

- [ ] **Step 5: Run the preflight script**

Run:

```bash
scripts/android-preflight.sh
```

Expected before JDK is installed on this machine:

```text
== Java ==
missing:java
install: brew install --cask temurin
```

Expected after JDK and Android SDK are configured: the script prints Java version, Gradle version, Android SDK path, adb version, connected devices, and next project commands.

- [ ] **Step 6: Document the script in `README.md`**

Add this section after the existing Android Java compile instructions:

```markdown
### Android Native Preflight

Run the native preflight before Android device QA:

```bash
scripts/android-preflight.sh
```

The script checks Java, the Gradle wrapper, Android SDK environment variables, adb, and connected devices.
```

- [ ] **Step 7: Record preflight status in `docs/android-qa.md`**

Add this section near the top:

```markdown
## Preflight Evidence

| Date | Machine | Java | Android SDK | adb devices | Result |
| --- | --- | --- | --- | --- | --- |
| 2026-05-27 | yzq local Mac | missing Java Runtime before setup | not verified | not verified | blocked until JDK is installed |
```

- [ ] **Step 8: Verify docs and script changes**

Run:

```bash
npm test -- src/native/overlay.test.ts src/native/speech.test.ts src/native/calendar.test.ts src/native/secureKeys.test.ts
bash -n scripts/android-preflight.sh
```

Expected: native bridge TypeScript tests pass and shell syntax check exits 0.

- [ ] **Step 9: Commit or record the change**

Run:

```bash
git rev-parse --is-inside-work-tree
```

If it prints `true`, run:

```bash
git add scripts/android-preflight.sh README.md docs/android-qa.md
git commit -m "chore: add android native preflight"
```

If it prints `fatal: not a git repository`, do not create a repository; record the changed files in the final summary.

---

### Task 2: Activate JDK And Prove Gradle Starts

**Files:**
- Modify only local shell environment if needed.
- Do not edit application source in this task.

- [ ] **Step 1: Confirm current Java state**

Run:

```bash
java -version
```

Expected on the current machine before setup:

```text
The operation couldn’t be completed. Unable to locate a Java Runtime.
```

- [ ] **Step 2: Install a JDK**

Run on macOS with Homebrew:

```bash
brew install --cask temurin
```

Expected: Homebrew installs Temurin JDK.

If Homebrew is unavailable, install Temurin 21 from Adoptium and then continue with the same verification commands below.

- [ ] **Step 3: Export JAVA_HOME for this shell**

Run:

```bash
export JAVA_HOME="$(/usr/libexec/java_home -v 21 2>/dev/null || /usr/libexec/java_home -v 17)"
export PATH="$JAVA_HOME/bin:$PATH"
java -version
```

Expected: Java prints version 17 or 21.

- [ ] **Step 4: Verify Gradle wrapper starts**

Run:

```bash
cd /Users/yzq/Desktop/project/KCust-AI/android
./gradlew -version
```

Expected: Gradle prints version information and exits 0.

- [ ] **Step 5: Run project preflight again**

Run:

```bash
cd /Users/yzq/Desktop/project/KCust-AI
scripts/android-preflight.sh
```

Expected: preflight reaches the `Project Commands` section. If adb shows no devices, that is acceptable for this task; device attachment is handled in Task 5.

---

### Task 3: Compile The Android Java Sources

**Files:**
- Modify Java plugin files only if the compiler reports concrete Java errors.

- [ ] **Step 1: Run front-end and Capacitor sync first**

Run:

```bash
cd /Users/yzq/Desktop/project/KCust-AI
npm test
npm run build
npx cap sync android
```

Expected:

```text
Test Files  17 passed
Tests  90 passed
✓ built
Sync finished
```

- [ ] **Step 2: Run Java compile**

Run:

```bash
cd /Users/yzq/Desktop/project/KCust-AI/android
./gradlew :app:compileDebugJavaWithJavac
```

Expected after JDK setup: Gradle compiles Java sources and exits 0.

- [ ] **Step 3: If compile fails, capture the exact compiler output**

Run:

```bash
cd /Users/yzq/Desktop/project/KCust-AI/android
./gradlew :app:compileDebugJavaWithJavac --stacktrace > /tmp/kcust-android-javac.log 2>&1
tail -120 /tmp/kcust-android-javac.log
```

Expected: the tail output contains exact file paths and line numbers. Fix only the reported lines.

- [ ] **Step 4: Re-run Java compile after any source fix**

Run:

```bash
cd /Users/yzq/Desktop/project/KCust-AI/android
./gradlew :app:compileDebugJavaWithJavac
```

Expected: command exits 0.

- [ ] **Step 5: Run debug assemble**

Run:

```bash
cd /Users/yzq/Desktop/project/KCust-AI/android
./gradlew :app:assembleDebug
```

Expected: debug APK exists at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

- [ ] **Step 6: Commit or record compile fixes**

Run:

```bash
git rev-parse --is-inside-work-tree
```

If it prints `true` and Java source files changed:

```bash
git add android/app/src/main/java/com/kcust/ai
git commit -m "fix: compile android native plugins"
```

If it prints `fatal: not a git repository`, record changed Java files and the passing Gradle command in the final summary.

---

### Task 4: Add Android Device Smoke Script

**Files:**
- Create: `scripts/android-device-smoke.sh`
- Modify: `docs/android-qa.md`

- [ ] **Step 1: Verify the script is missing**

Run:

```bash
test -x scripts/android-device-smoke.sh
```

Expected: command exits non-zero because the script does not exist yet.

- [ ] **Step 2: Create `scripts/android-device-smoke.sh`**

Add this exact file:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
PACKAGE_NAME="com.kcust.ai"
APK_PATH="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"

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
adb shell monkey -p "$PACKAGE_NAME" -c android.intent.category.LAUNCHER 1

printf '\n== Package Permissions ==\n'
adb shell dumpsys package "$PACKAGE_NAME" | grep -E "SYSTEM_ALERT_WINDOW|RECORD_AUDIO|READ_CALENDAR|WRITE_CALENDAR|POST_NOTIFICATIONS" || true

printf '\n== Recent KCUST Logs ==\n'
adb logcat -d -t 200 | grep -E "KCUST|Capacitor|Overlay|Speech|Calendar|SecureKeys" || true

printf '\nSmoke install and launch completed.\n'
```

- [ ] **Step 3: Make the script executable**

Run:

```bash
chmod +x scripts/android-device-smoke.sh
```

Expected: command exits 0.

- [ ] **Step 4: Syntax-check the script**

Run:

```bash
bash -n scripts/android-device-smoke.sh
```

Expected: command exits 0.

- [ ] **Step 5: Run without a device to verify the failure is clear**

Run with no emulator or device connected:

```bash
scripts/android-device-smoke.sh
```

Expected after APK build:

```text
No Android device or emulator is connected.
Start an emulator or connect a device with USB debugging enabled.
```

If a device is connected, expected output is:

```text
Smoke install and launch completed.
```

- [ ] **Step 6: Add script usage to `docs/android-qa.md`**

Append this section:

```markdown
## Automated Smoke Script

Run:

```bash
scripts/android-device-smoke.sh
```

Expected result with a connected device:

- Debug APK builds.
- APK installs over the previous build.
- App launches to KCUST AI.
- Permission dump includes overlay, microphone, calendar, and notification permissions.
- Recent logs show no uncaught native plugin crash.
```

- [ ] **Step 7: Verify**

Run:

```bash
bash -n scripts/android-device-smoke.sh
npm test
```

Expected: script syntax passes and all Vitest tests pass.

---

### Task 5: Run Manual Android Permission QA

**Files:**
- Modify: `docs/android-qa.md`

- [ ] **Step 1: Prepare the device**

Run:

```bash
adb devices
adb shell pm clear com.kcust.ai
scripts/android-device-smoke.sh
```

Expected: a connected device is listed, app data is cleared, the APK installs, and the app launches.

- [ ] **Step 2: Test microphone permission granted path**

Manual actions:

1. Tap the microphone button in the top bar.
2. Grant microphone permission.
3. Say: `我在无锡有哪些客户`.
4. Confirm the assistant input contains recognized Chinese text.

Record in `docs/android-qa.md`:

```markdown
| Speech granted | Pass/Fail | Recognized text appears in AI input |  |
```

- [ ] **Step 3: Test microphone denied path**

Manual actions:

1. Reset app permission for microphone from Android Settings.
2. Tap microphone.
3. Deny permission.
4. Confirm text input remains usable and the app shows a permission fallback notice.

Record:

```markdown
| Speech denied | Pass/Fail | Text input remains usable |  |
```

- [ ] **Step 4: Test calendar and notification granted path**

Manual actions:

1. Open `客户`.
2. Open `张总` detail.
3. Tap `添加待办`.
4. Enter title `张总方案复盘`.
5. Enter reminder time tomorrow at 09:30.
6. Save.
7. Grant notification permission if prompted.
8. Grant calendar permissions if prompted.
9. Open Android Calendar and confirm an event exists.

Record:

```markdown
| Reminder + calendar granted | Pass/Fail | Notification scheduled and calendar event created |  |
```

- [ ] **Step 5: Test calendar denied path**

Manual actions:

1. Revoke calendar permissions.
2. Add another customer todo with a future time.
3. Deny calendar permission.
4. Confirm the app still saves the todo and shows calendar unavailable or app-only fallback.

Record:

```markdown
| Calendar denied | Pass/Fail | Todo remains saved and notification path is not blocked |  |
```

- [ ] **Step 6: Test overlay granted path**

Manual actions:

1. Open `设置`.
2. Tap `开启悬浮球`.
3. Grant display-over-other-apps permission.
4. Return to app and tap `开启悬浮球` again.
5. Confirm floating `AI` bubble appears.
6. Drag it.
7. Tap it and confirm the app returns to foreground.

Record:

```markdown
| Overlay granted | Pass/Fail | Floating bubble appears, drags, and opens app |  |
```

- [ ] **Step 7: Test secure key storage**

Manual actions:

1. Open `设置`.
2. Save a test model key.
3. Force close the app.
4. Reopen the app.
5. Confirm the key configured state remains visible.
6. Clear the key and reopen again.
7. Confirm the key configured state is cleared.

Record:

```markdown
| Secure key storage | Pass/Fail | Key state survives restart and clears correctly |  |
```

- [ ] **Step 8: Add QA result table to `docs/android-qa.md`**

Append this table and fill the result column during execution:

```markdown
## Device QA Results

| Scenario | Result | Expected | Notes |
| --- | --- | --- | --- |
| Speech granted | Not run | Recognized text appears in AI input |  |
| Speech denied | Not run | Text input remains usable |  |
| Reminder + calendar granted | Not run | Notification scheduled and calendar event created |  |
| Calendar denied | Not run | Todo remains saved and notification path is not blocked |  |
| Overlay granted | Not run | Floating bubble appears, drags, and opens app |  |
| Overlay denied | Not run | Bottom AI input remains available |  |
| Secure key storage | Not run | Key state survives restart and clears correctly |  |
```

- [ ] **Step 9: Verify docs are updated**

Run:

```bash
rg -n "Device QA Results|Speech granted|Overlay granted|Secure key storage" docs/android-qa.md
```

Expected: all four terms are found.

---

### Task 6: Close The Android Native Loop

**Files:**
- Modify source files only for failures discovered in Tasks 3-5.
- Modify: `docs/android-qa.md`

- [ ] **Step 1: Run the full verification suite**

Run:

```bash
cd /Users/yzq/Desktop/project/KCust-AI
npm test
npm run lint
npm run build
npx cap sync android
cd android
./gradlew :app:compileDebugJavaWithJavac
./gradlew :app:assembleDebug
```

Expected: all commands exit 0.

- [ ] **Step 2: Run the device smoke script**

Run:

```bash
cd /Users/yzq/Desktop/project/KCust-AI
scripts/android-device-smoke.sh
```

Expected: debug APK installs and launches with no native plugin crash in recent logs.

- [ ] **Step 3: Update QA evidence**

In `docs/android-qa.md`, replace `Not run` values in the Device QA Results table with `Pass`, `Fail`, or `Blocked`.

Use this format for notes:

```markdown
| Speech granted | Pass | Recognized text appears in AI input | Pixel emulator API 36, 2026-05-27 |
```

- [ ] **Step 4: Final completion gate**

Run:

```bash
cd /Users/yzq/Desktop/project/KCust-AI
npm test
npm run lint
npm run build
npx cap sync android
cd android
./gradlew :app:compileDebugJavaWithJavac
./gradlew :app:assembleDebug
```

Expected:

```text
Test Files  17 passed
Tests  90 passed
✓ built
Sync finished
BUILD SUCCESSFUL
BUILD SUCCESSFUL
```

- [ ] **Step 5: Commit or record closure**

Run:

```bash
git rev-parse --is-inside-work-tree
```

If it prints `true`:

```bash
git add scripts README.md docs/android-qa.md android/app/src/main/java/com/kcust/ai
git commit -m "chore: close android native device loop"
```

If it prints `fatal: not a git repository`, record:

- verification commands run
- device or emulator model
- Android API level
- QA table result
- changed files

---

## Self-Review

**Spec coverage:** This plan covers Plan A: JDK/Gradle readiness, Java compile, APK assemble, device install/launch, permissions QA, overlay, speech, calendar, notifications, and Keystore verification.

**Scope:** It does not add CRM business features, true SQLite, mini overlay chat, relationship edges, repeat reminders, or import/export UI. Those belong to later plans.

**Type consistency:** The plan uses current file names and plugin names: `OverlayPlugin`, `SpeechPlugin`, `CalendarPlugin`, `SecureKeysPlugin`, package `com.kcust.ai`, and existing test count baseline `17 files / 90 tests`.
