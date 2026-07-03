# KCUST AI Remaining Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current Web/Capacitor prototype into an Android-first, local-first home-decoration customer assistant with real native storage, secure key handling, voice, calendar, floating assistant, and a cloud-model-backed Agent.

**Architecture:** Keep the React/Ionic UI as the primary product surface and isolate Android-only behavior behind small native bridge modules. Keep all AI write actions as explicit draft commands that require user confirmation before mutating the local repository.

**Tech Stack:** React, TypeScript, Vite, Ionic React, Capacitor Android, Capacitor Local Notifications, Android Java/Kotlin plugins, SQLite, Android Keystore, Android SpeechRecognizer, Android Calendar Provider, Vitest.

---

## Current Completed Surface

- Customer workbench, bottom navigation, customer cards, detail view, graph view, todos view, settings view.
- Manual customer create, edit, delete, search, detail navigation, and customer todo creation.
- Local rule Agent for creating customer drafts, querying customers, adding needs, reminder drafts, priority follow-up advice, next-step advice, ambiguity guard, and recent conversation display.
- Health score and stage-aware next-step suggestions.
- Local notification scheduling through Capacitor Local Notifications with permission fallback.
- Android manifest permissions and a basic floating bubble service class that can open the main activity.

## Remaining Work By Subsystem

### 1. Real Agent Runtime And Cloud Model Bridge

**Current state:** `src/domain/aiInterpreter.ts` uses fixed string rules and regex extraction. `src/domain/localAgent.ts` adds local priority and next-step logic. No cloud model call, JSON schema validation, streaming, retry, network state, or privacy confirmation exists.

**Files:**
- Modify: `src/domain/aiInterpreter.ts`
- Modify: `src/domain/localAgent.ts`
- Create: `src/domain/agentTools.ts`
- Create: `src/domain/agentRuntime.ts`
- Create: `src/domain/agentRuntime.test.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Define the Agent tool contract**

Create `src/domain/agentTools.ts` with typed tool names for customer search, customer draft creation, customer update draft creation, reminder draft creation, next-step suggestion, health score, and cluster summary.

- [ ] **Step 2: Add tests for cloud fallback behavior**

Create `src/domain/agentRuntime.test.ts` covering: API key missing uses local rules; offline state returns local-only message; model JSON draft requires confirmation; malformed model JSON falls back to `unknown`.

- [ ] **Step 3: Implement `runAgentCommand`**

Create `src/domain/agentRuntime.ts` that accepts input, customers, todos, now, apiKey, and network state. It should call local rules first for deterministic queries, then cloud model for broader extraction only when configured and online.

- [ ] **Step 4: Wire App to the new runtime**

Modify `src/App.tsx` so `runAssistant` calls `runAgentCommand` and displays whether the response came from local tools or model tools.

- [ ] **Step 5: Verify**

Run: `npm test -- src/domain/agentRuntime.test.ts src/App.test.tsx`

Expected: all Agent runtime and app tests pass.

### 2. SQLite Repository And Schema Expansion

**Current state:** `src/data/localRepository.ts` persists customers, todos, and API key in browser `localStorage`. The planned models `CustomerProfile`, `NeedTag`, `Interaction`, `Reminder`, `CalendarEventLink`, and persisted cluster/health records are not represented as storage tables.

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/data/localRepository.ts`
- Create: `src/data/schema.ts`
- Create: `src/data/sqliteRepository.ts`
- Create: `src/data/sqliteRepository.test.ts`
- Modify: `src/data/localRepository.test.ts`

- [ ] **Step 1: Expand domain types**

Add interfaces for `CustomerProfile`, `NeedTag`, `Interaction`, `Reminder`, `CalendarEventLink`, and a versioned `LocalSnapshot`.

- [ ] **Step 2: Add repository contract tests**

Write tests proving customers, todos, interactions, reminders, and calendar links can be inserted, updated, listed, and deleted without losing seed data.

- [ ] **Step 3: Implement schema module**

Create schema constants and migration version helpers in `src/data/schema.ts`.

- [ ] **Step 4: Implement SQLite adapter**

Add a native-capable repository adapter while keeping the current browser adapter for Web preview.

- [ ] **Step 5: Verify**

Run: `npm test -- src/data/localRepository.test.ts src/data/sqliteRepository.test.ts`

Expected: storage contract passes for both preview and SQLite-shaped repositories.

### 3. Android Native Capability Bridge

**Current state:** `android/app/src/main/java/com/kcust/ai/FloatingAssistantService.java` creates a draggable bubble, but there is no permission request UI, bridge method, settings toggle, lightweight AI panel, or stop/start flow. `MainActivity.java` is a plain `BridgeActivity`.

**Files:**
- Modify: `android/app/src/main/java/com/kcust/ai/MainActivity.java`
- Modify: `android/app/src/main/java/com/kcust/ai/FloatingAssistantService.java`
- Create: `android/app/src/main/java/com/kcust/ai/OverlayPlugin.java`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Create: `src/native/overlay.ts`
- Modify: `src/native/capabilities.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add overlay bridge tests at the TypeScript boundary**

Add tests that unavailable Web preview returns a fallback message and Android bridge success updates capability status.

- [ ] **Step 2: Implement `src/native/overlay.ts`**

Expose `checkOverlayPermission`, `requestOverlayPermission`, `startFloatingAssistant`, and `stopFloatingAssistant`.

- [ ] **Step 3: Register Android overlay plugin**

Create an Android plugin that checks `Settings.canDrawOverlays`, opens the overlay permission settings screen, and starts or stops `FloatingAssistantService`.

- [ ] **Step 4: Add Settings controls**

Add a toggle/button in Settings to request permission and enable the floating assistant.

- [ ] **Step 5: Verify**

Run: `npm test -- src/native/overlay.test.ts src/App.test.tsx && npm run build && npx cap sync android`

Expected: Web preview falls back cleanly; Android project syncs.

### 4. Voice Input

**Current state:** Voice buttons show the fallback notice `语音输入需要 Android 麦克风权限；Web 预览请先使用文字输入`. No real microphone permission flow, Android SpeechRecognizer bridge, transcript state, or correction step exists.

**Files:**
- Create: `src/native/speech.ts`
- Create: `src/native/speech.test.ts`
- Modify: `src/App.tsx`
- Modify: `android/app/src/main/java/com/kcust/ai/MainActivity.java`
- Create: `android/app/src/main/java/com/kcust/ai/SpeechPlugin.java`

- [ ] **Step 1: Test speech fallback and successful transcript**

Cover Web fallback and a mocked Android transcript returning text into the assistant input.

- [ ] **Step 2: Add TypeScript speech bridge**

Expose `isSpeechAvailable`, `requestSpeechPermission`, and `listenOnce`.

- [ ] **Step 3: Implement Android SpeechRecognizer plugin**

Use Android system speech recognition for one-shot dictation and return the best transcript.

- [ ] **Step 4: Wire UI**

Clicking the mic button should start listening on Android and place transcript text in the global assistant input for user review.

- [ ] **Step 5: Verify**

Run: `npm test -- src/native/speech.test.ts src/App.test.tsx && npm run build && npx cap sync android`

Expected: preview fallback remains clear; Android sync succeeds.

### 5. Calendar Event Integration

**Current state:** `src/native/reminders.ts` schedules app notifications only. Calendar permissions are declared in Android manifest, but there is no Calendar Provider write, no `CalendarEventLink`, and no calendar failure reason.

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/native/reminders.ts`
- Create: `src/native/calendar.ts`
- Create: `src/native/calendar.test.ts`
- Create: `android/app/src/main/java/com/kcust/ai/CalendarPlugin.java`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add calendar link model**

Add `CalendarEventLink` with todo id, provider event id, calendar id, write status, createdAt, and failure reason.

- [ ] **Step 2: Test reminder plus calendar behavior**

Cover notification scheduled plus calendar inserted, calendar permission denied, and notification scheduled while calendar write fails.

- [ ] **Step 3: Implement TypeScript calendar bridge**

Expose `listCalendars`, `requestCalendarPermission`, and `createCalendarEvent`.

- [ ] **Step 4: Implement Android Calendar Provider plugin**

Insert an event into the selected Android calendar and return the event id.

- [ ] **Step 5: Verify**

Run: `npm test -- src/native/reminders.test.ts src/native/calendar.test.ts && npm run build && npx cap sync android`

Expected: reminder creation still works when calendar is unavailable.

### 6. Customer Relationship Depth

**Current state:** Customer detail shows notes and todos as a communication timeline. There is no interaction CRUD, channel type, contact method, follow-up outcome, referral/relationship edge, or customer network beyond similarity clustering.

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/customerLogic.ts`
- Create: `src/domain/interactionLogic.ts`
- Create: `src/domain/relationshipGraph.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Create: `src/domain/interactionLogic.test.ts`
- Create: `src/domain/relationshipGraph.test.ts`

- [ ] **Step 1: Define interactions and relationship edges**

Add `Interaction` for communication records and `RelationshipEdge` for referral, family, designer, supplier, or similarity links.

- [ ] **Step 2: Add interaction tests**

Cover adding a call record, adding a site visit record, updating `lastInteractionAt`, and generating the next suggested follow-up.

- [ ] **Step 3: Add graph tests**

Cover grouping by city, budget, household, need tags, stage, health score, and explicit relationship edges.

- [ ] **Step 4: Implement UI forms**

Add communication record creation in customer detail and show real records in the timeline.

- [ ] **Step 5: Verify**

Run: `npm test -- src/domain/interactionLogic.test.ts src/domain/relationshipGraph.test.ts src/App.test.tsx`

Expected: detail timeline and graph use stored relationship data.

### 7. Product Hardening And Documentation

**Current state:** README still contains the Vite template. Browser tests cover many React flows, but there is no Android device QA checklist, privacy note, backup/export, import, or model-data disclosure.

**Files:**
- Modify: `README.md`
- Create: `docs/privacy.md`
- Create: `docs/android-qa.md`
- Create: `src/data/exportImport.ts`
- Create: `src/data/exportImport.test.ts`

- [ ] **Step 1: Replace README with app-specific instructions**

Document dev, test, build, Capacitor sync, and Android Studio run steps.

- [ ] **Step 2: Add privacy documentation**

Explain local-first storage, cloud model opt-in, API key storage, and which customer fields can be sent to the model.

- [ ] **Step 3: Add Android QA checklist**

Cover notification permission, overlay permission, speech permission, calendar permission, offline mode, and local data persistence.

- [ ] **Step 4: Add import/export**

Create JSON export and import helpers for customers, todos, interactions, reminders, and settings excluding API keys.

- [ ] **Step 5: Verify**

Run: `npm test -- src/data/exportImport.test.ts && npm run lint && npm run build`

Expected: docs exist and data export/import tests pass.

## Confirmation Questions Before Execution

1. Model provider: use OpenAI API first, or support a generic OpenAI-compatible endpoint?
2. Model data policy: can customer names, budgets, needs, and notes be sent to the cloud model after user enables the key?
3. Storage: use a Capacitor SQLite plugin, or write a small native SQLite bridge ourselves?
4. API key storage: require Android Keystore in the first Android build, or keep Web preview localStorage with an explicit warning?
5. Floating assistant: should the overlay show a real mini chat window, or is a floating bubble that jumps back to the app acceptable for v1?
6. Calendar: write into the default phone calendar automatically, or let the user choose a calendar in Settings?
7. Voice: Android system SpeechRecognizer, or cloud speech recognition through the model provider?
8. Relationship graph: should it mean similarity clustering only, or explicit relationship edges such as referral, family, designer, supplier, and property project?
9. Customer fields: which fields are required for v1 manual forms: stage, contact phone, WeChat, address/community, house type, family members, style, budget confidence, source channel?
10. Reminder semantics: support only one-time reminders in v1, or include repeat, snooze, and advance reminder offset?
11. Destructive actions: should deleting customers require a confirmation modal and soft-delete recovery?
12. Android target: which minimum Android version and device form factor should be tested first?

## Suggested Execution Split

Do not execute this as one large change. Split into these plans:

1. Agent runtime and model bridge.
2. SQLite storage and expanded schema.
3. Android native capabilities: overlay, voice, calendar, secure key.
4. Customer relationship depth and interaction timeline.
5. Product hardening, import/export, documentation, Android QA.
