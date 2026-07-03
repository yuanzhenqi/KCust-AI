# Agent Conversation UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the confirmed Agent conversation UI: lightweight by default, automatically expanded after Agent output, up to 80% viewport height, operable workbench background, action-first panel content, and manual collapse.

**Architecture:** Keep the existing React/Vite/Capacitor app and refactor only the `AssistantDock` area inside `src/App.tsx` plus its CSS. `App` continues to own assistant state and command data; the dock becomes a bottom-sheet style composition with an action-first panel, compact conversation preview, and pinned composer. This plan does not change customer CRUD, local repository behavior, native plugins, cloud Agent behavior, or reminder parsing logic.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, CSS, Capacitor Android smoke testing.

---

## Source Spec

- Design spec: `docs/superpowers/specs/2026-05-28-agent-conversation-ui-design.md`

## File Structure

- Modify: `src/App.test.tsx`
  - Add behavior tests for lightweight state, automatic expanded state, manual collapse preservation, action-first ordering, and human-readable reminder time.
- Modify: `src/App.tsx`
  - Keep `App` as state owner.
  - Refactor `AssistantDock` into smaller local functions in the same file: `AssistantActionPanel`, `AssistantConversationPreview`, `AssistantComposer`, and helper formatters.
  - Keep existing command confirmation behavior and repository writes unchanged.
- Modify: `src/App.css`
  - Replace the current compact absolute dock styling with a bottom-sheet layout that supports lightweight and expanded states.
  - Preserve the existing warm white business style.
- Modify: `docs/android-qa.md`
  - Only add a short QA note after manual/automated verification, not implementation details.

## Task 1: Lock The New Assistant UI Behavior With Tests

**Files:**
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Add a test for the default lightweight state**

Add this test inside `describe('KCUST AI app shell', () => { ... })`, near the existing render test:

```tsx
it('starts with a lightweight assistant bar and no expanded action panel', () => {
  render(<App />)

  expect(screen.getByLabelText('AI 助手')).toHaveAttribute('data-state', 'collapsed')
  expect(screen.getByPlaceholderText('告诉我：新增客户、查询客户、修改需求、创建提醒...')).toBeInTheDocument()
  expect(screen.queryByLabelText('Agent 动作面板')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '收起助手' })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the new default-state test and verify it fails**

Run:

```bash
npm test -- src/App.test.tsx -t "starts with a lightweight assistant bar"
```

Expected: FAIL because the current assistant aside does not expose `data-state="collapsed"` and may not have the new `Agent 动作面板` structure.

- [ ] **Step 3: Add a test for automatic expanded action-first output**

Add this test near the existing local Agent query tests:

```tsx
it('automatically expands an action-first assistant panel after an agent result', async () => {
  const user = userEvent.setup()
  render(<App />)

  await user.type(screen.getByPlaceholderText('告诉我：新增客户、查询客户、修改需求、创建提醒...'), '我在无锡有哪些客户')
  await user.click(screen.getByRole('button', { name: '生成草稿' }))

  expect(screen.getByLabelText('AI 助手')).toHaveAttribute('data-state', 'expanded')
  expect(screen.getByLabelText('Agent 动作面板')).toBeInTheDocument()
  expect(screen.getByText('当前动作')).toBeInTheDocument()
  expect(screen.getByText('最近对话')).toBeInTheDocument()
  expect(screen.getByText('我在无锡有哪些客户')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '收起助手' })).toBeInTheDocument()
})
```

- [ ] **Step 4: Run the expanded-state test and verify it fails**

Run:

```bash
npm test -- src/App.test.tsx -t "automatically expands an action-first"
```

Expected: FAIL because the current UI expands, but it does not expose the new `Agent 动作面板` and `当前动作` hierarchy.

- [ ] **Step 5: Replace the existing collapse test with a preservation test**

Replace the existing test named `collapses and expands the assistant conversation without hiding the input bar` with this test:

```tsx
it('collapses the assistant visually without losing the pending confirmation card', async () => {
  const user = userEvent.setup()
  render(<App />)

  await user.type(
    screen.getByPlaceholderText('告诉我：新增客户、查询客户、修改需求、创建提醒...'),
    '和无锡的王先生明天晚上八点有个会，提醒我',
  )
  await user.click(screen.getByRole('button', { name: '生成草稿' }))

  expect(await screen.findByText('提醒草稿')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '收起助手' }))

  expect(screen.getByLabelText('AI 助手')).toHaveAttribute('data-state', 'collapsed')
  expect(screen.queryByText('提醒草稿')).not.toBeInTheDocument()
  expect(screen.getByPlaceholderText('告诉我：新增客户、查询客户、修改需求、创建提醒...')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '展开助手' }))

  expect(screen.getByLabelText('AI 助手')).toHaveAttribute('data-state', 'expanded')
  expect(screen.getByText('提醒草稿')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '确认保存' })).toBeInTheDocument()
})
```

- [ ] **Step 6: Add a test for human-readable reminder time**

Replace the current assertion in `uses the current device date when drafting natural-language reminders`:

```tsx
expect(await screen.findByText('2026-05-29T20:00:00.000+08:00')).toBeInTheDocument()
```

with:

```tsx
expect(await screen.findByText('识别为：2026-05-29 20:00')).toBeInTheDocument()
expect(screen.queryByText('2026-05-29T20:00:00.000+08:00')).not.toBeInTheDocument()
```

- [ ] **Step 7: Run the focused assistant tests and verify the intended failures**

Run:

```bash
npm test -- src/App.test.tsx -t "assistant|Agent|reminder"
```

Expected: FAIL on the new UI hierarchy and human-readable reminder time assertions. Existing unrelated tests should either be skipped by the name filter or pass.

## Task 2: Refactor AssistantDock Into Action-First Structure

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Keep expansion state in `App` and ensure Agent runs auto-expand**

Verify `runAssistant` contains:

```tsx
setIsAssistantExpanded(true)
```

immediately after it confirms there is a non-empty prompt:

```tsx
const runAssistant = async () => {
  const prompt = assistantText.trim()
  if (!prompt) return
  setIsAssistantExpanded(true)

  const apiKey = repository.getModelApiKey()
  const online = resolveOnlineStatus(isOnline)
  // existing logic continues unchanged
}
```

If the call is missing or moved below model/local branching, place it exactly as shown.

- [ ] **Step 2: Replace `AssistantDock` JSX with a shell plus panel plus composer**

Replace the `return` block inside `AssistantDock` with this structure:

```tsx
  const hasAssistantContent = history.length > 0 || Boolean(pendingModelRequest) || Boolean(command)
  const assistantState = isExpanded && hasAssistantContent ? 'expanded' : 'collapsed'

  return (
    <aside className={`assistant-dock ${assistantState}`} data-state={assistantState} aria-label="AI 助手">
      {hasAssistantContent && (
        <button
          className="assistant-toggle"
          type="button"
          aria-label={assistantState === 'expanded' ? '收起助手' : '展开助手'}
          onClick={onToggleExpanded}
        >
          {assistantState === 'expanded' ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      )}

      {assistantState === 'expanded' && (
        <AssistantActionPanel
          command={command}
          runInfo={runInfo}
          pendingModelRequest={pendingModelRequest}
          history={history}
          onConfirmModelRequest={onConfirmModelRequest}
          onCancelModelRequest={onCancelModelRequest}
          onConfirm={onConfirm}
          onDismiss={onDismiss}
        />
      )}

      <AssistantComposer text={text} onChangeText={onChangeText} onRun={onRun} onVoiceInput={onVoiceInput} />
    </aside>
  )
```

- [ ] **Step 3: Add `AssistantActionPanel` below `AssistantDock`**

Add this function below `AssistantDock`:

```tsx
function AssistantActionPanel({
  command,
  runInfo,
  pendingModelRequest,
  history,
  onConfirmModelRequest,
  onCancelModelRequest,
  onConfirm,
  onDismiss,
}: {
  command: AssistantCommand | null
  runInfo: AssistantRunInfo | null
  pendingModelRequest: PendingModelRequest | null
  history: AssistantHistoryItem[]
  onConfirmModelRequest: () => void | Promise<void>
  onCancelModelRequest: () => void
  onConfirm: () => void
  onDismiss: () => void
}) {
  return (
    <div className="assistant-panel" aria-label="Agent 动作面板">
      <section className="assistant-panel-section assistant-current-action">
        <div className="assistant-section-heading">
          <Sparkles size={16} />
          <strong>当前动作</strong>
        </div>
        {pendingModelRequest && (
          <ModelDisclosureCard
            disclosure={pendingModelRequest.disclosure}
            onConfirm={onConfirmModelRequest}
            onCancel={onCancelModelRequest}
          />
        )}
        {command && <ConfirmationCard command={command} runInfo={runInfo} onConfirm={onConfirm} onDismiss={onDismiss} />}
        {!pendingModelRequest && !command && (
          <div className="assistant-empty-action">
            <strong>暂无待确认动作</strong>
            <span>你可以继续输入客户指令。</span>
          </div>
        )}
      </section>

      <AssistantConversationPreview history={history} />
    </div>
  )
}
```

- [ ] **Step 4: Add `AssistantConversationPreview` below `AssistantActionPanel`**

Add this function:

```tsx
function AssistantConversationPreview({ history }: { history: AssistantHistoryItem[] }) {
  if (history.length === 0) return null

  return (
    <section className="assistant-panel-section assistant-history" aria-label="最近对话">
      <div className="assistant-section-heading">
        <MessageCircle size={16} />
        <strong>最近对话</strong>
      </div>
      {history.slice(-4).map((item) => (
        <p className={item.role} key={item.id}>
          {item.text}
        </p>
      ))}
    </section>
  )
}
```

Also add `MessageCircle` to the lucide import list:

```tsx
  MessageCircle,
```

- [ ] **Step 5: Add `AssistantComposer` below `AssistantConversationPreview`**

Add this function:

```tsx
function AssistantComposer({
  text,
  onChangeText,
  onRun,
  onVoiceInput,
}: {
  text: string
  onChangeText: (value: string) => void
  onRun: () => void | Promise<void>
  onVoiceInput: () => void
}) {
  return (
    <div className="assistant-input">
      <button className="round-button" type="button" aria-label="语音输入" onClick={onVoiceInput}>
        <Mic size={18} />
      </button>
      <input
        value={text}
        onChange={(event) => onChangeText(event.target.value)}
        placeholder="告诉我：新增客户、查询客户、修改需求、创建提醒..."
      />
      <button className="send-button" type="button" onClick={onRun}>
        <Send size={16} />
        生成草稿
      </button>
    </div>
  )
}
```

- [ ] **Step 6: Run TypeScript and focused tests**

Run:

```bash
npm test -- src/App.test.tsx -t "starts with a lightweight assistant bar|automatically expands|collapses the assistant"
```

Expected: the structural tests should pass or fail only on style-independent text that Task 3 will address.

## Task 3: Make Action Cards Human-Readable And Work-Oriented

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Add helper functions for action metadata**

Add these helpers near `assistantSourceLabel`:

```tsx
function actionStatusText(command: AssistantCommand): string {
  if (command.kind === 'query-customers' || command.kind === 'agent-answer') return '已基于本地客户库生成回答'
  if (command.kind === 'unknown') return '需要补充信息'
  return '等待确认'
}

function actionPrimaryTitle(command: AssistantCommand): string {
  if (command.kind === 'create-reminder') return '提醒草稿'
  if (command.kind === 'create-customer') return '客户草稿'
  if (command.kind === 'update-customer') return '客户更新草稿'
  return command.title
}

function formatReminderRecognition(value: unknown): string {
  if (typeof value !== 'string') return '识别为：未填写'
  return `识别为：${formatDateTime(value)}`
}
```

- [ ] **Step 2: Update query/answer confirmation card header**

Inside `ConfirmationCard`, in the branch for `query-customers`, `unknown`, and `agent-answer`, replace:

```tsx
<strong>{command.title}</strong>
<p>{text}</p>
```

with:

```tsx
<div className="confirm-title">
  <Sparkles size={18} />
  <div>
    <strong>{actionPrimaryTitle(command)}</strong>
    <span>{actionStatusText(command)}</span>
  </div>
</div>
<p>{text}</p>
```

- [ ] **Step 3: Update draft confirmation card header**

Inside the draft-card branch of `ConfirmationCard`, replace the current `.confirm-title` body:

```tsx
<Sparkles size={18} />
<strong>{command.title}</strong>
```

with:

```tsx
<Sparkles size={18} />
<div>
  <strong>{actionPrimaryTitle(command)}</strong>
  <span>{actionStatusText(command)}</span>
</div>
```

- [ ] **Step 4: Render reminder time as human-readable primary text**

Inside the `field-grid` map in `ConfirmationCard`, replace:

```tsx
<strong>{formatFieldValue(key, value)}</strong>
```

with:

```tsx
<strong>{key === 'scheduledAt' ? formatReminderRecognition(value) : formatFieldValue(key, value)}</strong>
```

- [ ] **Step 5: Prevent raw ISO reminder timestamps in the primary UI**

Update `formatFieldValue` so `scheduledAt` never falls through to `String(value)`:

```tsx
function formatFieldValue(key: string, value: unknown): string {
  if (Array.isArray(value)) return value.join('、')
  if (key === 'budgetWan' && typeof value === 'number') return `${value}w`
  if (key === 'areaSqm' && typeof value === 'number') return `${value}平`
  if (key === 'scheduledAt') return formatReminderRecognition(value)
  if (key === 'channel' && value === 'app-and-calendar') return 'app 内提醒 + 安卓本机日历'
  if (key === 'status' && value === 'draft') return '待确认'
  return String(value || '未填写')
}
```

- [ ] **Step 6: Run the human-readable reminder test**

Run:

```bash
npm test -- src/App.test.tsx -t "uses the current device date"
```

Expected: PASS. The test should find `识别为：2026-05-29 20:00` and should not find the raw ISO timestamp.

- [ ] **Step 7: Run all App tests**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: all App tests pass.

## Task 4: Implement The 80% Bottom-Sheet Styling

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Replace assistant dock layout CSS**

Replace the existing `.assistant-dock`, `.assistant-toggle`, `.assistant-dock.collapsed .assistant-input`, `.assistant-history`, and `.assistant-input` blocks with the following CSS:

```css
.assistant-dock {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 78px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.assistant-dock.expanded {
  top: 20%;
}

.assistant-toggle,
.assistant-panel,
.assistant-input {
  pointer-events: auto;
}

.assistant-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 28px;
  margin: 0 auto;
  border-radius: 999px;
  color: #7b5a2e;
  background: rgba(255, 253, 248, 0.96);
  box-shadow: 0 10px 24px rgba(59, 46, 28, 0.12);
}

.assistant-panel {
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  border: 1px solid rgba(99, 79, 50, 0.14);
  border-radius: 24px 24px 18px 18px;
  background: rgba(255, 253, 248, 0.98);
  box-shadow: 0 22px 60px rgba(59, 46, 28, 0.18);
}

.assistant-panel-section + .assistant-panel-section {
  margin-top: 12px;
}

.assistant-section-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  color: #6f512d;
}

.assistant-section-heading strong {
  font-size: 13px;
}

.assistant-empty-action {
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 16px;
  color: #6b5c4a;
  background: #f8f2e8;
}

.assistant-empty-action strong {
  color: #2a241d;
  font-size: 13px;
}

.assistant-empty-action span {
  font-size: 12px;
}

.assistant-history {
  display: grid;
  gap: 8px;
}

.assistant-history p {
  width: fit-content;
  max-width: 88%;
  margin: 0;
  padding: 8px 10px;
  border-radius: 14px;
  font-size: 12px;
  line-height: 1.5;
}

.assistant-history p.user {
  justify-self: end;
  color: #fff8ea;
  background: #7a552a;
}

.assistant-history p.assistant {
  color: #4f4539;
  background: #f4eadc;
}

.assistant-input {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid rgba(81, 66, 45, 0.14);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18px 50px rgba(59, 46, 28, 0.16);
  backdrop-filter: blur(18px);
}

.assistant-dock.collapsed .assistant-input {
  box-shadow: 0 12px 32px rgba(59, 46, 28, 0.12);
}
```

- [ ] **Step 2: Add confirmation-card refinements**

Add or update these CSS rules near the existing `.confirm-card` rules:

```css
.confirm-card {
  padding: 14px;
  border: 1px solid rgba(99, 79, 50, 0.14);
  border-radius: 18px;
  background: #fffdf8;
}

.confirm-title div {
  display: grid;
  gap: 2px;
}

.confirm-title span {
  color: #806f5d;
  font-size: 12px;
  font-weight: 600;
}
```

Keep the existing `.field-grid`, `.confirm-actions`, and `.tool-trace` rules unless they conflict with the new layout.

- [ ] **Step 3: Keep mobile expanded height at 80%**

Inside the existing `@media (max-width: 520px)` block, add:

```css
  .assistant-dock.expanded {
    top: 20vh;
  }
```

Expected: on mobile, the expanded assistant panel can occupy the bottom 80% and leaves the top 20% of the workbench visible.

- [ ] **Step 4: Run lint and App tests**

Run:

```bash
npm test -- src/App.test.tsx && npm run lint
```

Expected: all App tests pass and lint exits 0.

## Task 5: Browser And Android Verification

**Files:**
- Modify: `docs/android-qa.md` only if recording final QA evidence.

- [ ] **Step 1: Run the full web verification suite**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected:

- Vitest reports all test files passing.
- ESLint exits 0.
- Vite build exits 0 and writes `dist/`.

- [ ] **Step 2: Start or reuse the Vite dev server**

If no dev server is running, run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL such as `http://127.0.0.1:5173/`.

- [ ] **Step 3: Browser smoke test the assistant states**

Using the in-app browser at `http://127.0.0.1:5173/`, verify:

1. Initial state shows only the lightweight assistant input bar.
2. Enter `我在无锡有哪些客户` and click `生成草稿`.
3. Assistant automatically expands.
4. `当前动作` appears above `最近对话`.
5. Click `收起助手`.
6. The panel collapses and the input bar remains visible.
7. Click `展开助手`.
8. The previous answer and recent conversation return.

Expected: no console errors, no text overlap, and the visible top workbench remains tappable.

- [ ] **Step 4: Build and sync Android**

Run:

```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
npx cap sync android
cd android
./gradlew :app:assembleDebug
```

Expected: Gradle exits 0 and writes `android/app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 5: Run Android smoke**

Run from the repository root:

```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
scripts/android-device-smoke.sh
```

Expected: script prints `Smoke install and launch completed.`

- [ ] **Step 6: Record QA evidence if Android verification is run**

If Android smoke or true device verification is run, append a row to `docs/android-qa.md` under the device evidence section:

```markdown
| 2026-05-28 | Agent conversation UI | Pass | Expanded action-first assistant panel auto-opens after Agent output, can manually collapse/expand, keeps input visible, and preserves workbench top context. |
```

- [ ] **Step 7: Commit or record changed files**

Run:

```bash
git rev-parse --is-inside-work-tree
```

If it prints `true`, run:

```bash
git add src/App.tsx src/App.css src/App.test.tsx docs/android-qa.md
git commit -m "feat: improve agent conversation panel"
```

If it prints `fatal: not a git repository`, do not create a repository. Record the changed files and verification commands in the final summary.

## Plan Self-Review

### Spec Coverage

- Lightweight default state: Task 1 and Task 2.
- Automatic result expansion: Task 1 and Task 2.
- Up to 80% viewport height: Task 4.
- Operable workbench background: Task 4 pointer-events and top 20% rules, plus Task 5 browser smoke.
- Action-first panel: Task 2 component order and Task 3 card metadata.
- Manual collapse preserving state: Task 1 and Task 2.
- Human-readable reminder time: Task 1 and Task 3.
- Testing and Android verification: Task 5.

### Placeholder Scan

After saving this plan, run:

```bash
rg -n "T[B]D|T[O]DO|implement [l]ater|fill in [d]etails|[a]ppropriate|similar [t]o|m[a]ybe|probab[l]y" docs/superpowers/plans/2026-05-28-agent-conversation-ui.md
```

Expected: no output.

### Type Consistency

The plan uses existing types from `src/App.tsx`:

- `AssistantCommand`
- `AssistantRunInfo`
- `PendingModelRequest`
- `AssistantHistoryItem`
- `AgentModelDisclosure`

New local component names are introduced in Task 2 and used consistently:

- `AssistantActionPanel`
- `AssistantConversationPreview`
- `AssistantComposer`

New helper names are introduced in Task 3 and used consistently:

- `actionStatusText`
- `actionPrimaryTitle`
- `formatReminderRecognition`
