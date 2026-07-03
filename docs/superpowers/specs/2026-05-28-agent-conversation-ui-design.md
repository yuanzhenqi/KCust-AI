# Agent Conversation UI Design

## Goal

Improve the in-app Agent conversation surface so it feels like a customer workbench with an AI assistant layered on top, not a chat app that replaces the workbench. The UI must show enough Agent context to understand what it recognized, what action it is proposing, and what still needs confirmation, while keeping the customer workspace visible and usable.

## Current Context

The current `AssistantDock` is an absolute-positioned bottom dock containing recent conversation, confirmation cards, and the input bar. A recent fix added a global expand/collapse control, but the expanded state still shows limited information and does not provide a strong hierarchy between actionable tasks and chat history.

## Chosen Direction

Use a hybrid of task-oriented information flow and mini conversation history.

- Default state: lightweight persistent input bar.
- Result state: automatically expand when the Agent generates a new result.
- Expanded height: up to 80% of the phone viewport.
- Background behavior: the remaining visible workspace stays operable.
- Panel structure: action-first.
- Collapse behavior: user manually collapses the panel.

## Interaction Model

The assistant has two primary states.

### Lightweight State

This is the default state when there is no new Agent output or after the user manually collapses the assistant.

- Shows the bottom input bar with voice button, text input, and send action.
- Shows a compact one-line status only when there is a pending unresolved action.
- Does not obscure the customer list, customer detail, graph, todo list, or settings page beyond the bottom input area.

### Expanded Action Panel

This state appears automatically after the Agent generates any new answer, draft, confirmation card, or action proposal.

- Occupies up to 80% of the phone viewport from the bottom.
- Leaves the top portion of the workbench visible and operable.
- Has a clear top affordance for manual collapse and expansion.
- Keeps the input bar pinned at the bottom of the panel.
- Allows the panel content to scroll internally when history or confirmation details exceed the available height.

## Information Hierarchy

The expanded panel should prioritize work outcomes over chat transcript.

1. Current action card
   - New customer draft.
   - Customer update draft.
   - Reminder draft.
   - Model data disclosure.
   - Query answer with local evidence.
2. Execution state
   - Waiting for confirmation.
   - Saved locally.
   - Notification scheduled.
   - Calendar linked or unavailable.
   - Permission fallback.
3. Recent conversation
   - Last 3-4 user/assistant turns.
   - Compact message bubbles or rows.
   - Older history is not required in this version.
4. Input bar
   - Voice.
   - Text.
   - Send/generate action.

## Confirmation Cards

Confirmation cards remain the most important content in the expanded panel.

- They stay visible until the user confirms, cancels, or manually collapses the panel.
- They should not auto-collapse.
- They should show structured fields first, not prose first.
- Reminder cards must show the parsed date in a human-readable format. Raw ISO timestamps should not be shown in the primary UI.
- Reminder cards should make uncertainty explicit, for example: `识别为：2026-05-29 20:00`.

## Visual Behavior

- The expanded panel should feel like a bottom sheet, not a modal that blocks the app.
- The visible workbench area above the sheet remains tappable.
- The panel should use the existing warm white business style.
- The panel should avoid nested card-heavy composition. Use one sheet surface, with repeated cards only for actual action items or message rows.
- The collapse affordance should be icon-based with accessible labels such as `收起助手` and `展开助手`.

## Data Flow

- `App` owns the assistant expansion state.
- Running the Agent sets the assistant state to expanded before or when the result arrives.
- Manual collapse changes only the visual state; it must not delete command state, confirmation cards, pending model requests, or conversation history.
- Confirming or cancelling an action can clear the action card, but the recent conversation summary should remain available until replaced by newer turns.
- Switching tabs should keep the assistant state unless the user manually collapses it.

## Error And Permission Handling

- Permission failures, offline fallbacks, and calendar/notification failures appear as execution state rows inside the action-first area.
- Voice failures should return to the input bar with a clear notice while leaving the panel usable.
- If a generated reminder has uncertain time semantics, the card should ask for confirmation rather than silently saving.

## Testing

Add focused tests for:

- Default render shows only the lightweight assistant input when there is no Agent result.
- Running a query automatically expands the assistant.
- Manual collapse hides action/history content but keeps the input bar visible.
- Manual expand restores the action/history content.
- Confirmation cards remain in state after collapse and re-expand.
- The expanded sheet exposes an accessible collapse control.
- Reminder confirmation cards display human-readable parsed time.

## Out Of Scope

- Full-screen chat mode.
- Long-term conversation archive.
- Cloud Agent behavior changes.
- New reminder parsing logic.
- Native floating-window redesign.
- Team collaboration or sync.

## Implementation Notes

The first implementation should stay close to the existing React structure:

- Refactor `AssistantDock` into smaller local components if needed: `AssistantShell`, `ActionCardStack`, `ConversationPreview`, and `AssistantComposer`.
- Keep styling in `src/App.css` unless the file becomes too large for readable maintenance.
- Avoid changing customer CRUD, local repository, native bridge, or model runtime behavior as part of this UI-only change.
