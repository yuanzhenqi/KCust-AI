# Agent Model Config Hybrid Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-configurable model provider settings and turn the Agent runtime into a cloud-model-understanding plus local-rule-validation hybrid loop.

**Architecture:** Keep local rules as the deterministic fallback and safety layer. Cloud model calls produce structured tool JSON only; local code persists model settings, validates model output against local customers and todos, grounds customer search answers in the local database, and keeps all write operations behind confirmation cards.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, Capacitor, local key-value repository, OpenAI-compatible Chat Completions API.

---

## Current Context

- `src/domain/openAIClient.ts` already supports `baseUrl` and `model` internally, but the defaults are hardcoded and the settings UI only exposes API Key.
- `src/domain/agentRuntime.ts` already switches to local rules when API Key, network, or `modelClient` is absent.
- `src/domain/agentRuntime.ts` already parses model JSON into `AssistantCommand`, but it does not yet run a separate local guardrail pass.
- `src/App.tsx` currently creates the model client with `createDefaultModelClient(repository.getModelApiKey())`, so the app cannot pass stored `baseUrl` or `model`.
- The project directory is not a Git repository in the current workspace. Execution workers must run `git rev-parse --is-inside-work-tree` before any commit step and skip commits when it prints `fatal: not a git repository`.

## File Structure

- Create: `src/domain/modelConfig.ts`
  - Own default model settings, normalization, and safe parsing of persisted JSON.
- Modify: `src/data/localRepository.ts`
  - Persist and read non-secret model configuration separately from API Key.
- Modify: `src/data/localRepository.test.ts`
  - Cover model configuration persistence and malformed stored config fallback.
- Modify: `src/data/localSchema.ts`
  - Include `modelConfig` in local snapshot schema metadata.
- Modify: `src/data/sqliteRepository.test.ts`
  - Keep the SQLite-shaped repository contract aligned with the local repository API and schema snapshot.
- Modify: `src/domain/openAIClient.ts`
  - Use shared defaults from `modelConfig.ts` and expose a connection test helper.
- Modify: `src/domain/openAIClient.test.ts`
  - Cover configured model IDs, default model IDs, and connection test behavior.
- Create: `src/domain/agentGuardrails.ts`
  - Validate model commands against local customer data and ground model customer queries in local search results.
- Create: `src/domain/agentGuardrails.test.ts`
  - Cover customer-query grounding, unsafe customer IDs, and ambiguous update handling.
- Modify: `src/domain/agentRuntime.ts`
  - Run the guardrail pass after parsing a model command and before returning it to the UI.
- Modify: `src/domain/agentRuntime.test.ts`
  - Verify guardrails are applied in the model path.
- Modify: `src/App.tsx`
  - Load, display, save, and use model settings; add a connection test action.
- Modify: `src/App.test.tsx`
  - Verify settings UI saves model ID/base URL, passes them to the model client, and displays connection test results.
- Modify: `docs/android-qa.md`
  - Add a manual QA row only after web or Android verification is run.

## Task 1: Persist Model Configuration Separately From API Key

**Files:**
- Create: `src/domain/modelConfig.ts`
- Modify: `src/data/localRepository.ts`
- Modify: `src/data/localRepository.test.ts`
- Modify: `src/data/localSchema.ts`
- Modify: `src/data/sqliteRepository.test.ts`

- [ ] **Step 1: Create model config domain helpers**

Create `src/domain/modelConfig.ts`:

```ts
export type ModelProvider = 'openai-compatible'

export interface ModelConfig {
  provider: ModelProvider
  baseUrl: string
  model: string
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
}

export function normalizeModelConfig(input: Partial<ModelConfig> | null | undefined): ModelConfig {
  return {
    provider: 'openai-compatible',
    baseUrl: normalizeBaseUrl(input?.baseUrl ?? DEFAULT_MODEL_CONFIG.baseUrl),
    model: normalizeModelId(input?.model ?? DEFAULT_MODEL_CONFIG.model),
  }
}

export function parseStoredModelConfig(raw: string | null): ModelConfig {
  if (!raw) return DEFAULT_MODEL_CONFIG

  try {
    const parsed = JSON.parse(raw) as Partial<ModelConfig>
    return normalizeModelConfig(parsed)
  } catch {
    return DEFAULT_MODEL_CONFIG
  }
}

export function serializeModelConfig(config: Partial<ModelConfig>): string {
  return JSON.stringify(normalizeModelConfig(config))
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim()
  return (trimmed || DEFAULT_MODEL_CONFIG.baseUrl).replace(/\/+$/, '')
}

function normalizeModelId(value: string): string {
  return value.trim() || DEFAULT_MODEL_CONFIG.model
}
```

- [ ] **Step 2: Add failing repository tests**

Append these tests inside `describe('local repository', () => { ... })` in `src/data/localRepository.test.ts`:

```ts
  it('stores and normalizes model configuration separately from the api key', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)

    repository.saveModelApiKey('sk-local-test')
    repository.saveModelConfig({
      provider: 'openai-compatible',
      baseUrl: 'https://model.example.test/v1/',
      model: 'kcust-model',
    })

    const reloaded = createLocalRepository(storage)
    expect(reloaded.getModelApiKey()).toBe('sk-local-test')
    expect(reloaded.getModelConfig()).toEqual({
      provider: 'openai-compatible',
      baseUrl: 'https://model.example.test/v1',
      model: 'kcust-model',
    })
  })

  it('falls back to default model configuration when stored config is malformed', () => {
    const storage = new MemoryStorage()
    storage.set('kcust.modelConfig', '{bad json')

    const repository = createLocalRepository(storage)

    expect(repository.getModelConfig()).toEqual({
      provider: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
    })
  })
```

Add this assertion inside `src/data/sqliteRepository.test.ts` in the repository contract test after `repository.saveCalendarEventLink(calendarEventLink)`:

```ts
    repository.saveModelConfig({
      provider: 'openai-compatible',
      baseUrl: 'https://model.example.test/v1/',
      model: 'kcust-model',
    })
```

Add this assertion after the existing `expect(reloaded.listCalendarEventLinks()).toEqual([calendarEventLink])`:

```ts
    expect(reloaded.getModelConfig()).toEqual({
      provider: 'openai-compatible',
      baseUrl: 'https://model.example.test/v1',
      model: 'kcust-model',
    })
```

Update the schema snapshot expectation in `src/data/sqliteRepository.test.ts` so `LOCAL_SCHEMA_TABLES` includes `modelConfig` at the end:

```ts
    expect(LOCAL_SCHEMA_TABLES).toEqual([
      'customers',
      'todos',
      'profiles',
      'needTags',
      'interactions',
      'reminders',
      'calendarEventLinks',
      'modelConfig',
    ])
```

- [ ] **Step 3: Run repository tests and verify they fail**

Run:

```bash
npm test -- src/data/localRepository.test.ts src/data/sqliteRepository.test.ts
```

Expected: FAIL because `getModelConfig`, `saveModelConfig`, and schema `modelConfig` do not exist yet.

- [ ] **Step 4: Extend the local repository contract**

Modify `src/data/localRepository.ts`:

```ts
import {
  DEFAULT_MODEL_CONFIG,
  parseStoredModelConfig,
  serializeModelConfig,
  type ModelConfig,
} from '../domain/modelConfig'
```

Add methods to `LocalRepository`:

```ts
  getModelConfig(): ModelConfig
  saveModelConfig(config: Partial<ModelConfig>): void
```

Add the storage key next to `MODEL_API_KEY`:

```ts
const MODEL_CONFIG_KEY = 'kcust.modelConfig'
```

Add methods inside `createLocalRepository(storage)` after `saveModelApiKey(apiKey) { ... }`:

```ts
    getModelConfig() {
      return parseStoredModelConfig(storage.get(MODEL_CONFIG_KEY))
    },
    saveModelConfig(config) {
      storage.set(MODEL_CONFIG_KEY, serializeModelConfig(config))
    },
```

Remove `DEFAULT_MODEL_CONFIG` from the import if TypeScript reports it is unused.

- [ ] **Step 5: Update schema metadata**

Modify `src/data/localSchema.ts` so `LOCAL_SCHEMA_TABLES` includes `modelConfig`:

```ts
export const LOCAL_SCHEMA_TABLES = [
  'customers',
  'todos',
  'profiles',
  'needTags',
  'interactions',
  'reminders',
  'calendarEventLinks',
  'modelConfig',
] as const
```

If `createEmptySnapshot()` has an object literal with arrays for each table, add:

```ts
    modelConfig: [],
```

- [ ] **Step 6: Run repository tests and verify they pass**

Run:

```bash
npm test -- src/data/localRepository.test.ts src/data/sqliteRepository.test.ts
```

Expected: PASS.

## Task 2: Make The OpenAI-Compatible Client Configurable And Testable

**Files:**
- Modify: `src/domain/openAIClient.ts`
- Modify: `src/domain/openAIClient.test.ts`

- [ ] **Step 1: Update OpenAI client tests for shared defaults and connection test**

Modify the imports in `src/domain/openAIClient.test.ts`:

```ts
import {
  createOpenAICompatibleModelClient,
  testOpenAICompatibleConnection,
} from './openAIClient'
```

Append these tests inside `describe('createOpenAICompatibleModelClient', () => { ... })`:

```ts
  it('tests OpenAI-compatible connectivity with configured base url and model id', async () => {
    const fetchImpl = vi.fn<FakeFetch>().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'ok' } }],
      }),
    )

    const result = await testOpenAICompatibleConnection(
      {
        apiKey: 'sk-config-key',
        baseUrl: 'https://model.example.test/v1/',
        model: 'kcust-connection-model',
      },
      fetchImpl,
    )

    expect(result).toEqual({ ok: true })
    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(url).toBe('https://model.example.test/v1/chat/completions')
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer sk-config-key',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'kcust-connection-model',
      max_tokens: 8,
      messages: [
        { role: 'system', content: 'Return only the text ok.' },
        { role: 'user', content: 'ping' },
      ],
    })
  })

  it('returns a readable connection failure instead of throwing', async () => {
    const fetchImpl = vi.fn<FakeFetch>().mockResolvedValue(
      jsonResponse({ error: { message: 'invalid api key' } }, { status: 401, statusText: 'Unauthorized' }),
    )

    const result = await testOpenAICompatibleConnection({ apiKey: 'sk-bad' }, fetchImpl)

    expect(result).toEqual({
      ok: false,
      message: 'OpenAI-compatible chat completion failed: 401 Unauthorized: invalid api key',
    })
  })
```

- [ ] **Step 2: Run OpenAI client tests and verify they fail**

Run:

```bash
npm test -- src/domain/openAIClient.test.ts
```

Expected: FAIL because `testOpenAICompatibleConnection` does not exist yet.

- [ ] **Step 3: Refactor client defaults and add connection test helper**

Modify `src/domain/openAIClient.ts`.

Add this import:

```ts
import { DEFAULT_MODEL_CONFIG, normalizeModelConfig } from './modelConfig'
```

Replace the local default constants:

```ts
const DEFAULT_BASE_URL = DEFAULT_MODEL_CONFIG.baseUrl
const DEFAULT_MODEL = DEFAULT_MODEL_CONFIG.model
```

Add these exports below `createOpenAICompatibleModelClient`:

```ts
export interface ModelConnectionTestResult {
  ok: boolean
  message?: string
}

export async function testOpenAICompatibleConnection(
  config: Partial<OpenAICompatibleModelClientConfig>,
  fetchImpl: FetchImpl = fetch,
): Promise<ModelConnectionTestResult> {
  try {
    const normalized = normalizeModelConfig(config)
    const apiKey = config.apiKey?.trim() ?? ''
    if (!apiKey) return { ok: false, message: '请先填写模型 API Key' }

    const response = await fetchImpl(`${normalized.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: normalized.model,
        max_tokens: 8,
        messages: [
          { role: 'system', content: 'Return only the text ok.' },
          { role: 'user', content: 'ping' },
        ],
      }),
    })

    if (!response.ok) {
      return { ok: false, message: await describeHttpError(response) }
    }

    return { ok: true }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '模型连接测试失败' }
  }
}
```

- [ ] **Step 4: Run OpenAI client tests and verify they pass**

Run:

```bash
npm test -- src/domain/openAIClient.test.ts
```

Expected: PASS.

## Task 3: Add Local Guardrails Around Model Commands

**Files:**
- Create: `src/domain/agentGuardrails.ts`
- Create: `src/domain/agentGuardrails.test.ts`
- Modify: `src/domain/agentRuntime.ts`
- Modify: `src/domain/agentRuntime.test.ts`

- [ ] **Step 1: Write guardrail tests**

Create `src/domain/agentGuardrails.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applyModelCommandGuardrails } from './agentGuardrails'
import type { AssistantCommand } from './aiInterpreter'
import type { Customer, Todo } from './types'

const customers: Customer[] = [
  {
    id: 'c-zhang',
    name: '张总',
    city: '无锡',
    budgetWan: 50,
    areaSqm: 120,
    propertyType: '高层',
    household: '3 人住，有小孩',
    stage: '方案',
    needs: ['智能家居'],
    notes: '',
    nextFollowUpAt: null,
    lastInteractionAt: null,
    createdAt: '2026-05-20T09:00:00.000+08:00',
    updatedAt: '2026-05-24T09:00:00.000+08:00',
    syncStatus: 'local',
  },
  {
    id: 'c-wang',
    name: '王先生',
    city: '无锡',
    budgetWan: 55,
    areaSqm: 125,
    propertyType: '高层',
    household: '3 人住，有小孩',
    stage: '初聊',
    needs: ['全屋定制'],
    notes: '',
    nextFollowUpAt: null,
    lastInteractionAt: null,
    createdAt: '2026-05-18T09:00:00.000+08:00',
    updatedAt: '2026-05-22T09:00:00.000+08:00',
    syncStatus: 'local',
  },
]

const todos: Todo[] = []

describe('agent guardrails', () => {
  it('grounds model customer query answers in the local customer database', () => {
    const command: AssistantCommand = {
      kind: 'query-customers',
      requiresConfirmation: false,
      title: '模型查询结果',
      payload: {
        city: '无锡',
        resultSummary: '模型编造客户｜无锡｜999w',
      },
    }

    const guarded = applyModelCommandGuardrails(command, { customers, todos })

    expect(guarded.command.kind).toBe('query-customers')
    if (guarded.command.kind !== 'query-customers') throw new Error('expected query command')
    expect(guarded.command.payload.resultSummary).toContain('张总')
    expect(guarded.command.payload.resultSummary).toContain('王先生')
    expect(guarded.command.payload.resultSummary).not.toContain('模型编造客户')
    expect(guarded.toolTrace).toContain('local:ground-query')
  })

  it('blocks model update commands that point to a missing customer id', () => {
    const command: AssistantCommand = {
      kind: 'update-customer',
      requiresConfirmation: true,
      title: '模型客户需求更新草稿',
      payload: {
        customerId: 'c-missing',
        customerName: '不存在客户',
        city: '无锡',
        need: '整体浴室',
      },
    }

    const guarded = applyModelCommandGuardrails(command, { customers, todos })

    expect(guarded.command.kind).toBe('unknown')
    if (guarded.command.kind !== 'unknown') throw new Error('expected unknown command')
    expect(guarded.command.payload.message).toContain('模型匹配的客户不存在')
    expect(guarded.toolTrace).toContain('local:block-missing-customer')
  })

  it('asks for clarification when model update command has multiple possible local customers', () => {
    const command: AssistantCommand = {
      kind: 'update-customer',
      requiresConfirmation: true,
      title: '模型客户需求更新草稿',
      payload: {
        customerId: null,
        customerName: '客户',
        city: '无锡',
        need: '整体浴室',
      },
    }

    const guarded = applyModelCommandGuardrails(command, { customers, todos })

    expect(guarded.command.kind).toBe('agent-answer')
    if (guarded.command.kind !== 'agent-answer') throw new Error('expected agent answer')
    expect(guarded.command.payload.message).toContain('张总')
    expect(guarded.command.payload.message).toContain('王先生')
    expect(guarded.command.requiresConfirmation).toBe(false)
    expect(guarded.toolTrace).toContain('local:clarify-customer')
  })

  it('blocks reminder drafts that reference a missing customer id', () => {
    const command: AssistantCommand = {
      kind: 'create-reminder',
      requiresConfirmation: true,
      title: '模型提醒草稿',
      payload: {
        customerId: 'c-missing',
        title: '和客户开会',
        scheduledAt: '2026-06-08T20:00:00.000+08:00',
        channel: 'app-and-calendar',
        status: 'draft',
      },
    }

    const guarded = applyModelCommandGuardrails(command, { customers, todos })

    expect(guarded.command.kind).toBe('unknown')
    if (guarded.command.kind !== 'unknown') throw new Error('expected unknown command')
    expect(guarded.command.payload.message).toContain('模型匹配的客户不存在')
  })
})
```

- [ ] **Step 2: Run guardrail tests and verify they fail**

Run:

```bash
npm test -- src/domain/agentGuardrails.test.ts
```

Expected: FAIL because `src/domain/agentGuardrails.ts` does not exist yet.

- [ ] **Step 3: Implement guardrails**

Create `src/domain/agentGuardrails.ts`:

```ts
import type { AssistantCommand } from './aiInterpreter'
import { filterCustomersByCity, summarizeCustomers } from './customerLogic'
import type { Customer, Todo } from './types'

export interface AgentGuardrailContext {
  customers: Customer[]
  todos: Todo[]
}

export interface GuardedCommandResult {
  command: AssistantCommand
  toolTrace: string[]
}

export function applyModelCommandGuardrails(
  command: AssistantCommand,
  context: AgentGuardrailContext,
): GuardedCommandResult {
  if (command.kind === 'query-customers') {
    const matches = command.payload.city === '全部'
      ? context.customers
      : filterCustomersByCity(context.customers, command.payload.city)

    return {
      command: {
        ...command,
        title: '本地客户查询结果',
        payload: {
          ...command.payload,
          resultSummary: summarizeCustomers(matches),
        },
      },
      toolTrace: ['local:ground-query'],
    }
  }

  if (command.kind === 'update-customer') {
    if (command.payload.customerId && !context.customers.some((customer) => customer.id === command.payload.customerId)) {
      return blockMissingCustomer()
    }

    if (!command.payload.customerId) {
      const cityMatches = command.payload.city ? filterCustomersByCity(context.customers, command.payload.city) : context.customers
      if (cityMatches.length > 1) {
        return {
          command: {
            kind: 'agent-answer',
            requiresConfirmation: false,
            title: '需要确认客户',
            payload: {
              message: `我找到了 ${cityMatches.length} 位${command.payload.city || ''}客户：${cityMatches.map((customer) => customer.name).join('、')}。请补充客户姓名后我再生成修改草稿。`,
              toolTrace: ['客户匹配', '歧义检查'],
            },
          },
          toolTrace: ['local:clarify-customer'],
        }
      }
    }
  }

  if (command.kind === 'create-reminder') {
    if (command.payload.customerId && !context.customers.some((customer) => customer.id === command.payload.customerId)) {
      return blockMissingCustomer()
    }
  }

  return { command, toolTrace: [] }
}

function blockMissingCustomer(): GuardedCommandResult {
  return {
    command: {
      kind: 'unknown',
      requiresConfirmation: false,
      title: '模型响应未执行',
      payload: { message: '模型匹配的客户不存在，已阻止执行。请重新指定客户。' },
    },
    toolTrace: ['local:block-missing-customer'],
  }
}
```

- [ ] **Step 4: Wire guardrails into model runtime**

Modify `src/domain/agentRuntime.ts`.

Add import:

```ts
import { applyModelCommandGuardrails } from './agentGuardrails'
```

Inside `runAgentCommand`, replace:

```ts
    const parsed = parseModelCommand(rawCommand)

    return {
      command: parsed.command,
      source: 'model',
      toolTrace: parsed.toolTrace,
      modelDisclosure,
    }
```

with:

```ts
    const parsed = parseModelCommand(rawCommand)
    const guarded = applyModelCommandGuardrails(parsed.command, {
      customers: context.customers,
      todos: context.todos,
    })

    return {
      command: guarded.command,
      source: 'model',
      toolTrace: [...parsed.toolTrace, ...guarded.toolTrace],
      modelDisclosure,
    }
```

- [ ] **Step 5: Add model runtime guardrail integration tests**

Append this test to `src/domain/agentRuntime.test.ts`:

```ts
  it('grounds model customer query responses before returning them to the app', async () => {
    const result = await runAgentCommand('我在无锡有哪些客户', {
      customers,
      todos,
      now,
      apiKey: 'sk-local-test',
      isOnline: true,
      modelClient: vi.fn<AgentModelClient>().mockResolvedValue(
        JSON.stringify({
          kind: 'query-customers',
          requiresConfirmation: false,
          title: '模型查询结果',
          payload: {
            city: '无锡',
            resultSummary: '模型编造客户｜无锡｜999w',
          },
        }),
      ),
    })

    expect(result.source).toBe('model')
    expect(result.command.kind).toBe('query-customers')
    if (result.command.kind !== 'query-customers') throw new Error('expected query command')
    expect(result.command.payload.resultSummary).toContain('张总')
    expect(result.command.payload.resultSummary).not.toContain('模型编造客户')
    expect(result.toolTrace).toContain('local:ground-query')
  })
```

- [ ] **Step 6: Run guardrail and runtime tests**

Run:

```bash
npm test -- src/domain/agentGuardrails.test.ts src/domain/agentRuntime.test.ts
```

Expected: PASS.

## Task 4: Add Model Settings UI And Use Config In Agent Calls

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: Add App tests for model settings**

Append this test inside `describe('KCUST AI app shell', () => { ... })` in `src/App.test.tsx`:

```tsx
  it('saves model base url and model id from settings and passes them to the model client', async () => {
    const user = userEvent.setup()
    const modelClient = vi.fn<AgentModelClient>().mockResolvedValue(
      JSON.stringify({
        kind: 'agent-answer',
        requiresConfirmation: false,
        title: '模型 Agent 建议',
        payload: { message: '模型配置已生效。', toolTrace: ['model:agent-answer'] },
      }),
    )
    render(<App modelClient={modelClient} isOnline={true} />)

    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.clear(screen.getByLabelText('模型 Base URL'))
    await user.type(screen.getByLabelText('模型 Base URL'), 'https://model.example.test/v1/')
    await user.clear(screen.getByLabelText('模型 ID'))
    await user.type(screen.getByLabelText('模型 ID'), 'kcust-model')
    await user.type(screen.getByLabelText('模型 API Key'), 'sk-local-test')
    await user.click(screen.getByRole('button', { name: '保存模型配置' }))

    expect(screen.getByText('模型配置已保存')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'AI 助手输入' }), '今天怎么安排')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))
    await user.click(screen.getByRole('button', { name: '允许发送并生成' }))

    expect(await screen.findByText('模型 Agent 建议')).toBeInTheDocument()
    expect(modelClient).toHaveBeenCalledTimes(1)
    expect(modelClient.mock.calls[0]?.[0].modelConfig).toMatchObject({
      provider: 'openai-compatible',
      apiKey: 'sk-local-test',
      baseUrl: 'https://model.example.test/v1',
      model: 'kcust-model',
    })
  })
```

Append this test:

```tsx
  it('tests model connection from settings and shows the result', async () => {
    const user = userEvent.setup()
    const modelClient = vi.fn<AgentModelClient>()
    const connectionTester = vi.fn().mockResolvedValue({ ok: true })
    render(<App modelClient={modelClient} isOnline={true} modelConnectionTester={connectionTester} />)

    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.clear(screen.getByLabelText('模型 Base URL'))
    await user.type(screen.getByLabelText('模型 Base URL'), 'https://model.example.test/v1/')
    await user.clear(screen.getByLabelText('模型 ID'))
    await user.type(screen.getByLabelText('模型 ID'), 'kcust-model')
    await user.type(screen.getByLabelText('模型 API Key'), 'sk-local-test')
    await user.click(screen.getByRole('button', { name: '测试模型连接' }))

    expect(connectionTester).toHaveBeenCalledWith({
      apiKey: 'sk-local-test',
      baseUrl: 'https://model.example.test/v1',
      model: 'kcust-model',
    })
    expect(await screen.findByText('模型连接测试通过')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the new App tests and verify they fail**

Run:

```bash
npm test -- src/App.test.tsx -t "model base url|tests model connection"
```

Expected: FAIL because settings UI fields, save handler, and `modelConnectionTester` prop do not exist yet.

- [ ] **Step 3: Extend App props and state**

Modify imports in `src/App.tsx`:

```ts
import { normalizeModelConfig, type ModelConfig } from './domain/modelConfig'
import {
  createOpenAICompatibleModelClient,
  testOpenAICompatibleConnection,
  type ModelConnectionTestResult,
} from './domain/openAIClient'
```

Change `AppProps`:

```ts
  modelConnectionTester?: (config: { apiKey: string; baseUrl: string; model: string }) => Promise<ModelConnectionTestResult>
```

Add `modelConnectionTester` to the `App` destructuring:

```ts
  modelConnectionTester = testOpenAICompatibleConnection,
```

Add state after `isModelApiKeyConfigured`:

```ts
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => repository.getModelConfig())
```

- [ ] **Step 4: Use model config when running the Agent**

Inside `executeAssistant`, add `modelConfig` to `runAgentCommand`:

```ts
      modelConfig: {
        baseUrl: modelConfig.baseUrl,
        model: modelConfig.model,
      },
      modelClient: modelClient ?? createDefaultModelClient(repository.getModelApiKey(), modelConfig),
```

Replace `createDefaultModelClient` at the bottom of `src/App.tsx`:

```ts
function createDefaultModelClient(apiKey: string, modelConfig: ModelConfig): AgentModelClient | undefined {
  const trimmedApiKey = apiKey.trim()
  return trimmedApiKey
    ? createOpenAICompatibleModelClient({
        apiKey: trimmedApiKey,
        baseUrl: modelConfig.baseUrl,
        model: modelConfig.model,
      })
    : undefined
}
```

- [ ] **Step 5: Replace API-key-only save handler with model settings handlers**

Replace `saveModelApiKey` in `src/App.tsx` with:

```ts
  const saveModelSettings = async (nextSettings: { apiKey: string; baseUrl: string; model: string }) => {
    const normalized = normalizeModelConfig({
      provider: 'openai-compatible',
      baseUrl: nextSettings.baseUrl,
      model: nextSettings.model,
    })
    repository.saveModelConfig(normalized)
    setModelConfig(normalized)
    repository.saveModelApiKey(nextSettings.apiKey)
    setIsModelApiKeyConfigured(Boolean(nextSettings.apiKey.trim()))
    const result = await saveModelApiKeySecure(nextSettings.apiKey, { bridge: secureKeysBridge, platform: secureKeysPlatform })
    setNotice(result.status === 'fallback' ? '模型配置已保存' : `${result.message}，模型配置已保存`)
  }

  const testModelConnection = async (nextSettings: { apiKey: string; baseUrl: string; model: string }) => {
    const normalized = normalizeModelConfig({
      provider: 'openai-compatible',
      baseUrl: nextSettings.baseUrl,
      model: nextSettings.model,
    })
    const result = await modelConnectionTester({
      apiKey: nextSettings.apiKey,
      baseUrl: normalized.baseUrl,
      model: normalized.model,
    })
    setNotice(result.ok ? '模型连接测试通过' : `模型连接测试失败：${result.message ?? '请检查配置'}`)
  }
```

Update the `SettingsView` call:

```tsx
            modelConfig={modelConfig}
            onSaveModelSettings={saveModelSettings}
            onTestModelConnection={testModelConnection}
```

- [ ] **Step 6: Update SettingsView props and markup**

Replace `SettingsView` props and component signature with:

```tsx
function SettingsView({
  isModelApiKeyConfigured,
  modelConfig,
  floatingAssistantState,
  onEnableFloatingAssistant,
  onDisableFloatingAssistant,
  onSaveModelSettings,
  onTestModelConnection,
}: {
  isModelApiKeyConfigured: boolean
  modelConfig: ModelConfig
  floatingAssistantState: FloatingAssistantState
  onEnableFloatingAssistant: () => void | Promise<void>
  onDisableFloatingAssistant: () => void | Promise<void>
  onSaveModelSettings: (settings: { apiKey: string; baseUrl: string; model: string }) => void | Promise<void>
  onTestModelConnection: (settings: { apiKey: string; baseUrl: string; model: string }) => void | Promise<void>
}) {
  const capabilities = getNativeCapabilityMatrix()
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [baseUrlDraft, setBaseUrlDraft] = useState(modelConfig.baseUrl)
  const [modelDraft, setModelDraft] = useState(modelConfig.model)
  const settingsDraft = { apiKey: apiKeyDraft, baseUrl: baseUrlDraft, model: modelDraft }
```

Replace the existing model key card with:

```tsx
      <section className="setting-key-card">
        <div>
          <KeyRound size={20} />
          <strong>{isModelApiKeyConfigured ? '模型配置已启用' : '模型配置未启用'}</strong>
        </div>
        <label>
          <span>模型 Base URL</span>
          <input
            value={baseUrlDraft}
            onChange={(event) => setBaseUrlDraft(event.target.value)}
            aria-label="模型 Base URL"
            placeholder="https://api.openai.com/v1"
          />
        </label>
        <label>
          <span>模型 ID</span>
          <input
            value={modelDraft}
            onChange={(event) => setModelDraft(event.target.value)}
            aria-label="模型 ID"
            placeholder="gpt-4.1-mini"
          />
        </label>
        <label>
          <span>模型 API Key</span>
          <input
            value={apiKeyDraft}
            onChange={(event) => setApiKeyDraft(event.target.value)}
            type="password"
            aria-label="模型 API Key"
            placeholder="sk-..."
          />
        </label>
        <p>{isModelApiKeyConfigured ? 'Key 已保存在本机安全区，模型 Agent 可启用' : '未填写 Key 时自动使用本地规则 Agent。'}</p>
        <div className="setting-actions">
          <button type="button" className="ghost-action" onClick={() => onTestModelConnection(settingsDraft)}>
            测试模型连接
          </button>
          <button type="button" className="primary-action" onClick={() => onSaveModelSettings(settingsDraft)}>
            保存模型配置
          </button>
        </div>
      </section>
```

- [ ] **Step 7: Run App tests and fix type errors from renamed props**

Run:

```bash
npm test -- src/App.test.tsx
```

Expected: PASS after all references to `onSaveApiKey` are replaced with `onSaveModelSettings`.

## Task 5: Verify Hybrid Agent Behavior End To End

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `docs/android-qa.md`

- [ ] **Step 1: Add an App-level grounding test**

Append this test inside `describe('KCUST AI app shell', () => { ... })` in `src/App.test.tsx`:

```tsx
  it('shows locally grounded customer query results even when the model invents the summary', async () => {
    const user = userEvent.setup()
    const modelClient = vi.fn<AgentModelClient>().mockResolvedValue(
      JSON.stringify({
        kind: 'query-customers',
        requiresConfirmation: false,
        title: '模型查询结果',
        payload: {
          city: '无锡',
          resultSummary: '模型编造客户｜无锡｜999w',
        },
      }),
    )
    render(<App modelClient={modelClient} isOnline={true} />)

    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.type(screen.getByLabelText('模型 API Key'), 'sk-local-test')
    await user.click(screen.getByRole('button', { name: '保存模型配置' }))

    await user.type(screen.getByRole('textbox', { name: 'AI 助手输入' }), '我在无锡有哪些客户')
    await user.click(screen.getByRole('button', { name: '生成草稿' }))
    await user.click(screen.getByRole('button', { name: '允许发送并生成' }))

    expect(await screen.findByText('本地客户查询结果')).toBeInTheDocument()
    expect(screen.getByText(/张总/)).toBeInTheDocument()
    expect(screen.getByText(/王先生/)).toBeInTheDocument()
    expect(screen.queryByText(/模型编造客户/)).not.toBeInTheDocument()
    expect(screen.getByText('工具：model:query-customers / local:ground-query')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run focused hybrid App test**

Run:

```bash
npm test -- src/App.test.tsx -t "locally grounded customer query"
```

Expected: PASS.

- [ ] **Step 3: Run the full verification suite**

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

- [ ] **Step 4: Browser smoke test the settings and Agent path**

Start the dev server:

```bash
npm run dev -- --host 127.0.0.1
```

Using the in-app browser at `http://127.0.0.1:5173/`, verify:

1. Open `设置`.
2. Confirm `模型 Base URL`, `模型 ID`, and `模型 API Key` inputs are visible.
3. Enter `https://api.openai.com/v1` in Base URL.
4. Enter `gpt-4.1-mini` in Model ID.
5. Enter a non-secret dummy key `sk-local-preview` for UI smoke only.
6. Click `保存模型配置`.
7. Confirm the notice says `模型配置已保存` or includes `模型配置已保存`.
8. Return to the assistant input and ask `我在无锡有哪些客户`.
9. If the dummy key causes the model call to fail, confirm the app shows a safe model failure message instead of saving or changing customer data.

Expected: no console errors, settings fields fit on mobile width, and failed model calls do not mutate customers or todos.

- [ ] **Step 5: Android build and smoke**

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

Run from the repository root:

```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
scripts/android-device-smoke.sh
```

Expected: script prints `Smoke install and launch completed.`

- [ ] **Step 6: Record QA evidence**

If web or Android smoke verification is run, append this row to `docs/android-qa.md` under `Device QA Results`:

```markdown
| Agent model configuration | Pass | Settings allow Base URL, Model ID, and API Key configuration; model calls use saved settings; local guardrails keep customer query answers grounded in the local database. | 2026-06-07: web smoke and Android smoke completed after `npm test`, `npm run lint`, `npm run build`, `npx cap sync android`, and `./gradlew :app:assembleDebug`. |
```

- [ ] **Step 7: Commit or record changed files**

Run:

```bash
git rev-parse --is-inside-work-tree
```

If it prints `true`, run:

```bash
git add src/domain/modelConfig.ts src/data/localRepository.ts src/data/localRepository.test.ts src/data/localSchema.ts src/data/sqliteRepository.test.ts src/domain/openAIClient.ts src/domain/openAIClient.test.ts src/domain/agentGuardrails.ts src/domain/agentGuardrails.test.ts src/domain/agentRuntime.ts src/domain/agentRuntime.test.ts src/App.tsx src/App.test.tsx docs/android-qa.md
git commit -m "feat: configure hybrid model agent"
```

If it prints `fatal: not a git repository`, do not initialize Git. Record changed files and verification commands in the final implementation summary.

## Plan Self-Review

### Spec Coverage

- User-configurable model-id: Task 1 persists model config, Task 4 exposes and uses Model ID.
- User-configurable base URL: Task 1 persists base URL, Task 4 exposes and passes Base URL.
- Keep local rules: Task 3 adds guardrails and Task 5 verifies local grounding.
- Cloud model plus rules: Task 3 wires model output through local guardrails before UI commands.
- API connection test: Task 2 adds helper, Task 4 adds UI action and tests.
- Confirmation-first writes: Plan keeps existing `AssistantCommand.requiresConfirmation` path and adds guardrails before confirmation cards.
- Offline/local fallback: Existing runtime fallback remains unchanged; Task 4 only changes model config wiring.

### Placeholder Scan

Run:

```bash
rg -n "T[B]D|T[O]DO|implement [l]ater|fill in [d]etails|[a]ppropriate|similar [t]o|m[a]ybe|probab[l]y|if [n]eeded" docs/superpowers/plans/2026-06-07-agent-model-config-hybrid-runtime.md
```

Expected: no output.

### Type Consistency

- `ModelConfig` is defined once in `src/domain/modelConfig.ts` and reused by repository and app code.
- `OpenAICompatibleModelClientConfig` remains the client-facing config shape and accepts `apiKey`, `baseUrl`, and `model`.
- `modelConnectionTester` receives `{ apiKey, baseUrl, model }` and returns `ModelConnectionTestResult`.
- `applyModelCommandGuardrails` returns `{ command, toolTrace }`, and `runAgentCommand` merges guardrail traces after model traces.
