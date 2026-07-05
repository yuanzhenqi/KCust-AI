# Android QA Checklist

Use this checklist on a physical Android device or emulator after `npm run build` and `npx cap sync android`.

## Preflight Evidence

| Date | Machine | Java | Android SDK | adb devices | Result |
| --- | --- | --- | --- | --- | --- |
| 2026-05-27 | yzq local Mac | missing Java Runtime before setup | not verified | not verified | blocked until JDK is installed |
| 2026-05-27 | yzq local Mac | Homebrew openjdk@21 21.0.11 | Android SDK 36 + emulator 36.5.11 | emulator-5554 | preflight, assemble, install, and launch passed |

## Build

- Install JDK 21 and run `cd android && ./gradlew :app:compileDebugJavaWithJavac`.
- Debug APK output path is `android/app/build/outputs/apk/debug/kcust-ai.apk`.
- Launch the app and confirm it opens directly to the customer workbench.

## Automated Smoke Script

Run `scripts/android-device-smoke.sh` from the repository root to build the web app, sync Capacitor, assemble the Android debug APK, install it on a connected Android device or emulator, launch `com.kcust.ai`, print selected package permissions, and show recent KCUST/Capacitor/native logs.

The script requires JDK 21 and an Android SDK. If `JAVA_HOME` is unset, it tries Homebrew `openjdk@21` first and then `/usr/libexec/java_home -v 21`. If Android SDK environment variables are unset, it tries `/opt/homebrew/share/android-commandlinetools`.

If no Android device or emulator is connected after the APK build, the script exits with code `2` and prints:

```text
No Android device or emulator is connected.
Start an emulator or connect a device with USB debugging enabled.
```

With a connected device, the expected completion line is:

```text
Smoke install and launch completed.
```

## Permissions

- Tap microphone: Android should ask for microphone permission and return recognized text to the AI input.
- Add a reminder: Android should request notification permission when needed.
- Confirm a reminder with time: app notification should be scheduled; calendar permission should be requested and a calendar event should be created when granted.
- Enable floating assistant: Android should open display-over-other-apps permission settings when not granted, then start the draggable bubble after permission is granted.

## Fallbacks

- Deny microphone: app should keep text input available.
- Deny notification: todo should still be saved as app-only.
- Deny calendar: notification should remain scheduled and the app should show calendar unavailable.
- Deny overlay: bottom AI input remains the primary assistant surface.

## Core Flows

- Add a customer with AI and confirm the draft.
- Query local customers by city.
- Add a need to an existing customer through AI and confirm.
- Add a manual customer and edit it.
- Add a communication record from customer detail and confirm it appears in the timeline.
- Export a local snapshot and import it into a clean preview repository.

## Floating Assistant Full-Screen QA

These checks must be run on a physical Android device because Web tests only verify the Capacitor bridge contract.

- Enable the floating assistant from Settings and leave KCUST AI.
- Tap the side handle from another app. The expanded panel should open next to the handle without a visible flash.
- Tap a blank area outside the expanded panel. The panel should collapse with the configured animation and the handle should remain visible.
- Drag the handle to the left side and right side. The handle should dock correctly on both sides and preserve the chosen size and opacity.
- Press and hold the floating voice button from another app, speak a short customer command, then release. The floating panel should show recording, recognizing, Agent processing, and result states without opening KCUST AI.
- Use a command that produces a confirmation card, such as `张总明天晚上八点提醒我发图纸`. The floating panel should show confirm and cancel actions; confirm should save the todo/reminder and refresh the floating todo list.
- Create or complete a todo inside KCUST AI while the floating assistant is enabled. The floating panel todo list should update without restarting the overlay service.
- Deny microphone permission, then try floating voice again. The floating panel should explain the missing permission and keep the text/voice fallback usable.

## Device QA Results

| Scenario | Result | Expected | Notes |
| --- | --- | --- | --- |
| Speech granted | Blocked | Recognized text appears in AI input | Pixel 6 AVD API 36, 2026-05-27: microphone permission granted and Google Speech UI opened in Chinese; headless emulator had no spoken audio input, so app returned the empty-speech fallback. Needs physical device voice test. |
| Speech denied | Pass | Text input remains usable | Pixel 6 AVD API 36, 2026-05-27: denied microphone permission, app showed `语音输入需要麦克风权限；请授权后再试`, bottom text input remained available. |
| Reminder + calendar granted | Pass | Notification scheduled and calendar event created | Pixel 6 AVD API 36, 2026-05-27: granted notification/calendar permissions, created local `KCUST` calendar, saved `张总方案复盘`; app showed notification scheduled and Android calendar linked, `content://com.android.calendar/events` contained the event. |
| Calendar denied | Pass | Todo remains saved and notification path is not blocked | Pixel 6 AVD API 36, 2026-05-27: denied calendar permission, saved `张总日历拒绝测试`; app kept the todo and showed `系统通知已调度，日历暂不可用`. |
| Overlay granted | Pass | Floating bubble appears, drags, and opens app | Pixel 6 AVD API 36, 2026-05-27: `SYSTEM_ALERT_WINDOW` allowed, `FloatingAssistantService` running, overlay window present, bubble visible, draggable, and tapping it brought KCUST AI foreground from launcher. |
| Overlay denied | Pass | Bottom AI input remains available | Pixel 6 AVD API 36, 2026-05-27: `SYSTEM_ALERT_WINDOW` denied, enabling overlay opened Android settings and app showed waiting-for-authorization fallback while bottom AI input remained available. |
| Secure key storage | Pass | Key state survives restart and clears correctly | Pixel 6 AVD API 36, 2026-05-27: test key saved to Android Keystore, configured state survived force-stop/reopen, clearing key persisted after another force-stop/reopen. |
| Agent conversation UI | Pass | Expanded action-first assistant panel auto-opens after Agent output, can manually collapse/expand, keeps input visible, and preserves workbench top context. | Emulator `emulator-5554`, 2026-05-28: smoke install and launch completed after `npm test`, `npm run lint`, `npm run build`, `npx cap sync android`, and `./gradlew :app:assembleDebug`; in-app browser smoke verified the Agent panel states with no console errors. |
| Agent model configuration | Pass | Settings allow Base URL, Model ID, and API Key configuration; model calls use saved settings; local guardrails keep customer query answers grounded in the local database. | Emulator `emulator-5554`, 2026-06-07: web smoke verified settings fields, saved dummy model config, and safe model-failure fallback with no console errors; Android smoke completed after `npm test`, `npm run lint`, `npm run build`, `npx cap sync android`, and `./gradlew :app:assembleDebug`. |
| Floating assistant in other apps | Needs physical device retest | Voice recognition, Agent processing, confirmation cards, collapse animation, and todo sync work inside the floating panel without launching KCUST AI. | Updated target on 2026-07-04 after the floating assistant was changed from an app launcher bubble into an in-overlay assistant surface. |
