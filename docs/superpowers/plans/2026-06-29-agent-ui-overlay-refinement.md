# Agent UI Overlay Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the Agent-centered navigation, Agent page information density, long voice transcript preview, and Android floating overlay interaction.

**Architecture:** Keep React UI behavior in `src/App.tsx` and `src/App.css`. Keep Android overlay behavior in `FloatingAssistantService.java` and the existing `OverlayPlugin.java` contract. Do not change Agent command semantics or local storage data shapes.

**Tech Stack:** React, TypeScript, CSS, Vitest, Capacitor, Android Java.

## Global Constraints

- Bottom navigation order is `工作台 / 客户 / Agent / 待办 / 设置`.
- Agent page removes the large outer bubble around the action/history stream.
- Agent composer previews long voice transcripts across multiple visible lines.
- Android overlay defaults to a side handle and expands to a lightweight panel with hold-to-talk and recent todos.
- No new third-party dependencies.

---

### Task 1: React Navigation And Agent Composer

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: existing `navItems`, `AgentChatView`, `AssistantActionPanel`, and `AssistantComposer`.
- Produces: unchanged public React props and unchanged Agent command flow.

- [ ] **Step 1: Write failing tests**

Add tests that assert Agent is the third bottom tab, Agent page action panel does not use the outer assistant bubble class, and the Agent input is a multi-line textarea.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- src/App.test.tsx`
Expected: FAIL before implementation.

- [ ] **Step 3: Implement minimal React and CSS changes**

Reorder `navItems`, change the Agent action panel container class, and reshape the Agent composer to show the textarea as the full-width first row.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- src/App.test.tsx`
Expected: PASS.

### Task 2: Android Overlay Side Handle

**Files:**
- Modify: `android/app/src/main/java/com/kcust/ai/FloatingAssistantService.java`
- Test: Android build through Gradle.

**Interfaces:**
- Consumes: existing `OverlayPlugin.start({ mode, todos })` and `consumePendingCommand()`.
- Produces: unchanged pending command bridge behavior.

- [ ] **Step 1: Update native overlay UI**

Change the floating entry from a circular bubble to a compact side handle, and change the expanded panel copy and layout to focus on hold-to-talk plus recent todos.

- [ ] **Step 2: Build Android debug APK**

Run: `npm run build`, `npx cap sync android`, then `cd android && ./gradlew assembleDebug`.
Expected: `BUILD SUCCESSFUL`.

### Task 3: Final Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 2: Run full tests**

Run: `npm test`
Expected: all test files pass.

- [ ] **Step 3: Confirm APK path**

Run: `stat -f '%N %Sm %z bytes' android/app/build/outputs/apk/debug/app-debug.apk`
Expected: APK file exists and timestamp is current.
