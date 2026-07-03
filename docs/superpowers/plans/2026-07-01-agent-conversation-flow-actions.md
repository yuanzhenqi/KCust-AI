# Agent Conversation Flow Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Agent processing states and confirmation cards from the top action area into the bottom of the conversation flow, near the latest user message.

**Architecture:** Keep Agent command execution unchanged. Reshape only the React presentation layer in `src/App.tsx` and the related CSS in `src/App.css`, with App tests proving DOM order and user-visible labels.

**Tech Stack:** React, TypeScript, CSS, Vitest, Testing Library.

## Global Constraints

- Current action and confirmation UI must follow the latest conversation content, not precede it.
- Empty Agent state should be lightweight and not reserve a large top action block.
- Existing Agent command confirmation behavior must remain unchanged.
- No new dependencies.

---

### Task 1: Conversation-First Agent Flow

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: existing `AssistantCommand`, `AssistantRunInfo`, `AssistantProcessEvent`, and `AssistantHistoryItem` props.
- Produces: unchanged `onConfirm`, `onDismiss`, and `onRun` behavior.

- [ ] **Step 1: Write failing tests**

Assert that after an Agent result, the latest user message appears before the current Agent result in `Agent 动作面板`, and the old `当前动作` heading is no longer rendered as a top section.

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- src/App.test.tsx`
Expected: FAIL because current markup renders `当前动作` before `最近对话`.

- [ ] **Step 3: Implement conversation-first rendering**

Render the history first, then render the running state, process timeline, and confirmation card as a live result block after the history.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run final verification**

Run: `npm run lint`, `npm test`, and `npm run build`.
Expected: all commands exit with code 0.
