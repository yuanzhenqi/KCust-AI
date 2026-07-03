# Floating Assistant Dock Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Android floating assistant work on both screen sides, follow its handle, allow size/opacity adjustment, and show clear recording plus Agent handoff state.

**Architecture:** Keep the existing Capacitor `Overlay` bridge. Add a typed status update method in `src/native/overlay.ts`, route App Agent execution milestones through it, and keep all floating window layout behavior inside `FloatingAssistantService.java`.

**Tech Stack:** React, TypeScript, Vitest, Capacitor, Android Java.

## Global Constraints

- The floating handle must support left and right docking.
- The expanded panel must open near the handle and be draggable.
- Size and opacity controls are handled inside the Android floating panel.
- The floating panel shows recording and Agent handoff states.
- Confirmation operations still open the App for final confirmation.
- No new dependencies.

---

### Task 1: Overlay Status Bridge

**Files:**
- Modify: `src/native/overlay.test.ts`
- Modify: `src/native/overlay.ts`
- Modify: `src/App.tsx`
- Modify: `android/app/src/main/java/com/kcust/ai/OverlayPlugin.java`

**Interfaces:**
- Produces: `updateFloatingAssistantStatus({ message, detail? })`.
- Consumes: existing `OverlayBridge` plugin registration.

- [ ] **Step 1: Write failing bridge test**

Add a test that calls `updateFloatingAssistantStatus` on Android and expects `bridge.updateStatus({ message, detail })`.

- [ ] **Step 2: Implement bridge and App calls**

Add `updateStatus` to the TS bridge and native plugin. Call it when the App receives a floating command, starts generation, gets a confirmation result, gets a normal answer, or catches an execution failure.

### Task 2: Native Floating Window Interaction

**Files:**
- Modify: `android/app/src/main/java/com/kcust/ai/FloatingAssistantService.java`

**Interfaces:**
- Consumes: service intent extras `todos`, `status`, and `statusDetail`.
- Produces: same pending command behavior through `OverlayPlugin.setPendingCommand`.

- [ ] **Step 1: Implement side-aware handle**

Track `dockSide`, snap the handle to the closest side on release, update handle text and rounded corners per side, and keep it inside screen bounds.

- [ ] **Step 2: Implement following and draggable panel**

Compute panel x/y from the handle location when opening. Allow dragging the panel from its title row and clamp it inside the display.

- [ ] **Step 3: Implement size and opacity controls**

Add `小 / 中 / 大` and `60% / 80% / 100%` controls inside the panel. Apply them to handle/panel dimensions and alpha.

- [ ] **Step 4: Improve state display**

Show `准备录音 / 正在听 / 识别中 / 已识别 / 已交给 Agent / 需要在 App 确认 / Agent 已回复 / Agent 失败` in `statusText` and `detailText`.

### Task 3: Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/native/overlay.test.ts src/App.test.tsx`.

- [ ] **Step 2: Run full checks**

Run: `npm run lint`, `npm test`, `npm run build`, `npx cap sync android`, and `cd android && ./gradlew assembleDebug`.
