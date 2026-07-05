import type { AssistantBatchAction, AssistantCommand } from './aiInterpreter'
import { applyModelCommandGuardrails } from './agentGuardrails'
import { normalizeCustomerUpdateDraft } from './customerUpdateNormalization'
import {
  AGENT_TOOL_NAMES,
  createAgentContextSummary,
  createModelDisclosure,
  type AgentModelDisclosure,
  type AgentSendableContextSummary,
  type AgentSource,
  type AgentToolName,
} from './agentTools'
import { runLocalAgentTurn, type AgentMemory } from './conversationAgent'
import type {
  Customer,
  CustomerDraft,
  CustomerStage,
  CustomerUpdateDraft,
  Interaction,
  ProfileFieldDefinition,
  ProfileFieldPrimitiveValue,
  ReminderDraft,
  Todo,
} from './types'

export interface OpenAICompatibleModelConfig {
  provider: 'openai-compatible'
  apiKey: string
  baseUrl?: string
  model?: string
}

export interface AgentModelRequest {
  input: string
  now: string
  apiKey: string
  modelConfig: OpenAICompatibleModelConfig
  tools: readonly AgentToolName[]
  contextSummary: AgentSendableContextSummary
  responseFormat: 'assistant-command-json'
  onStreamChunk?: (chunk: string) => void
}

export type AgentModelClient = (request: AgentModelRequest) => Promise<unknown> | unknown

export type AgentRuntimeEventKind = 'model-start' | 'model-retry' | 'model-success' | 'model-error'

export interface AgentRuntimeEvent {
  kind: AgentRuntimeEventKind
  message: string
  detail?: string
}

export interface RunAgentContext {
  customers: Customer[]
  todos: Todo[]
  interactions?: Interaction[]
  profileFields?: ProfileFieldDefinition[]
  now: string
  apiKey: string
  isOnline: boolean
  modelConfig?: Pick<OpenAICompatibleModelConfig, 'baseUrl' | 'model'>
  modelClient?: AgentModelClient
  memory?: AgentMemory | null
  onModelChunk?: (chunk: string) => void
  onStatus?: (event: AgentRuntimeEvent) => void
}

export interface AgentRunResult {
  command: AssistantCommand
  source: AgentSource
  toolTrace: string[]
  modelDisclosure?: AgentModelDisclosure
  memory?: AgentMemory | null
}

const CUSTOMER_STAGES: readonly CustomerStage[] = ['线索', '初聊', '量房', '方案', '报价', '成交', '搁置', '流失']
const DEFAULT_MODEL_RETRY_COUNT = 3

export async function runAgentCommand(input: string, context: RunAgentContext): Promise<AgentRunResult> {
  const apiKey = context.apiKey.trim()

  if (!apiKey || !context.isOnline || !context.modelClient) {
    return runLocal(input, context)
  }

  const contextSummary = createAgentContextSummary(
    context.customers,
    context.todos,
    context.now,
    context.interactions ?? [],
    context.profileFields,
  )
  const modelDisclosure = createModelDisclosure(contextSummary)
  const retryTrace: string[] = []

  try {
    context.onStatus?.({ kind: 'model-start', message: '开始调用模型 Agent' })
    const rawCommand = await runModelRequestWithRetries(
      () =>
        context.modelClient?.({
          input,
          now: context.now,
          apiKey,
          modelConfig: {
            provider: 'openai-compatible',
            apiKey,
            ...context.modelConfig,
          },
          tools: AGENT_TOOL_NAMES,
          contextSummary,
          responseFormat: 'assistant-command-json',
          onStreamChunk: context.onModelChunk,
        }),
      retryTrace,
      (attempt, error) => {
        context.onStatus?.({
          kind: 'model-retry',
          message: `模型调用失败，正在进行第 ${attempt} 次重试`,
          detail: readableModelError(error),
        })
      },
    )
    const parsed = parseModelCommand(rawCommand, contextSummary.profileFields.map((field) => field.key))
    const guarded = applyModelCommandGuardrails(parsed.command, {
      customers: context.customers,
      todos: context.todos,
    })
    context.onStatus?.({ kind: 'model-success', message: '模型 Agent 已返回结果' })

    return {
      command: guarded.command,
      source: 'model',
      toolTrace: [...retryTrace, ...parsed.toolTrace, ...guarded.toolTrace],
      modelDisclosure,
      memory: null,
    }
  } catch (error) {
    context.onStatus?.({ kind: 'model-error', message: '模型 Agent 调用失败', detail: readableModelError(error) })
    return {
      command: unknownCommand(`模型调用失败：${readableModelError(error)}。请检查模型 Base URL、模型 ID、API Key 或网络连接。`),
      source: 'model',
      toolTrace: ['model:request-failed'],
      modelDisclosure,
      memory: null,
    }
  }
}

async function runModelRequestWithRetries(
  request: () => Promise<unknown> | unknown,
  retryTrace: string[],
  onRetry?: (attempt: number, error: unknown) => void,
): Promise<unknown> {
  let lastError: unknown

  for (let attempt = 0; attempt <= DEFAULT_MODEL_RETRY_COUNT; attempt += 1) {
    try {
      return await request()
    } catch (error) {
      lastError = error
      if (attempt >= DEFAULT_MODEL_RETRY_COUNT) break
      retryTrace.push(`model:retry-${attempt + 1}`)
      onRetry?.(attempt + 1, error)
    }
  }

  throw lastError
}

function readableModelError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === 'string' && error.trim()) return error.trim()
  return '未知错误'
}

function runLocal(input: string, context: RunAgentContext): AgentRunResult {
  const turn = runLocalAgentTurn(input, {
    customers: context.customers,
    todos: context.todos,
    now: context.now,
    interactions: context.interactions,
    memory: context.memory,
  })

  return {
    command: turn.command,
    source: 'local',
    toolTrace: traceForCommand(turn.command, 'local'),
    memory: turn.memory,
  }
}

function parseModelCommand(
  rawCommand: unknown,
  allowedProfileKeys: readonly string[],
): { command: AssistantCommand; toolTrace: string[] } {
  const parsed = parseJsonObject(rawCommand)

  if (!parsed) {
    return {
      command: unknownCommand('模型返回无法解析，已安全改为未知指令。'),
      toolTrace: ['model:invalid-json'],
    }
  }

  const kind = parsed.kind
  if (!isAgentCommandKind(kind)) {
    return {
      command: unknownCommand('模型返回了未知指令，已阻止执行。'),
      toolTrace: ['model:unknown-kind'],
    }
  }

  const title = optionalString(parsed.title)
  const topLevelTrace = stringArray(parsed.toolTrace)

  if (kind === 'create-customer') {
    const payload = parseCustomerDraft(parsed.payload, allowedProfileKeys)
    if (!payload) return invalidPayload()

    const command: AssistantCommand = {
      kind,
      requiresConfirmation: true,
      title: title ?? '模型客户草稿',
      payload,
    }

    return { command, toolTrace: topLevelTrace ?? traceForCommand(command, 'model') }
  }

  if (kind === 'query-customers') {
    const payload = parseQueryPayload(parsed.payload)
    if (!payload) return invalidPayload()

    const command: AssistantCommand = {
      kind,
      requiresConfirmation: false,
      title: title ?? '模型客户查询结果',
      payload,
    }

    return { command, toolTrace: topLevelTrace ?? traceForCommand(command, 'model') }
  }

  if (kind === 'agent-answer') {
    const payload = parseAgentAnswerPayload(parsed.payload)
    if (!payload) return invalidPayload()

    const command: AssistantCommand = {
      kind,
      requiresConfirmation: false,
      title: title ?? '模型 Agent 建议',
      payload,
    }

    return { command, toolTrace: topLevelTrace ?? payload.toolTrace }
  }

  if (kind === 'update-customer') {
    const payload = parseUpdateCustomerPayload(parsed.payload, allowedProfileKeys)
    if (!payload) return invalidPayload()

    const command: AssistantCommand = {
      kind,
      requiresConfirmation: true,
      title: title ?? '模型客户需求更新草稿',
      payload,
    }

    return { command, toolTrace: topLevelTrace ?? traceForCommand(command, 'model') }
  }

  if (kind === 'create-interaction') {
    const payload = parseInteractionPayload(parsed.payload)
    if (!payload) return invalidPayload()

    const command: AssistantCommand = {
      kind,
      requiresConfirmation: true,
      title: title ?? '模型沟通记录草稿',
      payload,
    }

    return { command, toolTrace: topLevelTrace ?? traceForCommand(command, 'model') }
  }

  if (kind === 'batch-actions') {
    const payload = parseBatchActionsPayload(parsed.payload, allowedProfileKeys)
    if (!payload) return invalidPayload()

    const command: AssistantCommand = {
      kind,
      requiresConfirmation: true,
      title: title ?? '模型批量动作草稿',
      payload,
    }

    return { command, toolTrace: topLevelTrace ?? traceForCommand(command, 'model') }
  }

  const payload = parseReminderDraft(parsed.payload)
  if (!payload) return invalidPayload()

  const command: AssistantCommand = {
    kind,
    requiresConfirmation: true,
    title: title ?? '模型提醒草稿',
    payload,
  }

  return { command, toolTrace: topLevelTrace ?? traceForCommand(command, 'model') }
}

function traceForCommand(command: AssistantCommand, source: AgentSource): string[] {
  if (command.kind === 'agent-answer') return command.payload.toolTrace
  if (command.kind === 'unknown') return [`${source}:unknown`]
  return [`${source}:${command.kind}`]
}

function invalidPayload(): { command: AssistantCommand; toolTrace: string[] } {
  return {
    command: unknownCommand('模型返回字段不完整，已阻止执行。'),
    toolTrace: ['model:invalid-payload'],
  }
}

function unknownCommand(message: string): AssistantCommand {
  return {
    kind: 'unknown',
    requiresConfirmation: false,
    title: '模型响应未执行',
    payload: { message },
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return isRecord(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  return isRecord(value) ? value : null
}

function parseCustomerDraft(value: unknown, allowedProfileKeys: readonly string[]): CustomerDraft | null {
  if (!isRecord(value)) return null

  const draft: CustomerDraft = {}

  const stringFields = ['name', 'wechatName', 'city', 'propertyType', 'household', 'sourceChannel', 'stylePreference', 'notes', 'demandDate', 'serviceValue', 'firstInteractionAt', 'firstInteractionSummary', 'nextAction'] as const
  for (const field of stringFields) {
    const parsed = optionalString(value[field])
    if (value[field] !== undefined && parsed === undefined) return null
    if (parsed !== undefined) draft[field] = parsed
  }

  const budgetWan = optionalNumber(value.budgetWan)
  if (value.budgetWan !== undefined && budgetWan === undefined) return null
  if (budgetWan !== undefined) draft.budgetWan = budgetWan

  const areaSqm = optionalNumber(value.areaSqm)
  if (value.areaSqm !== undefined && areaSqm === undefined) return null
  if (areaSqm !== undefined) draft.areaSqm = areaSqm

  const stage = optionalCustomerStage(value.stage)
  if (value.stage !== undefined && stage === undefined) return null
  if (stage !== undefined) draft.stage = stage

  const needs = stringArray(value.needs)
  if (value.needs !== undefined && needs === undefined) return null
  if (needs !== undefined) draft.needs = needs

  const urgent = optionalBoolean(value.urgent)
  if (value.urgent !== undefined && urgent === undefined) return null
  if (urgent !== undefined) draft.urgent = urgent

  const profileValues = profileValueMap(value.profileValues, allowedProfileKeys)
  if (value.profileValues !== undefined && profileValues === undefined) return null
  if (profileValues !== undefined) draft.profileValues = profileValues

  return draft
}

function parseQueryPayload(value: unknown): { city: string; resultSummary: string } | null {
  if (!isRecord(value)) return null
  const city = optionalString(value.city)
  const resultSummary = optionalString(value.resultSummary)
  if (city === undefined || resultSummary === undefined) return null
  return { city, resultSummary }
}

function parseAgentAnswerPayload(value: unknown): { message: string; toolTrace: string[] } | null {
  if (!isRecord(value)) return null
  const message = optionalString(value.message)
  if (message === undefined) return null

  const payloadTrace = stringArray(value.toolTrace)
  if (value.toolTrace !== undefined && payloadTrace === undefined) return null

  return {
    message,
    toolTrace: payloadTrace ?? ['model:agent-answer'],
  }
}

function parseUpdateCustomerPayload(
  value: unknown,
  allowedProfileKeys: readonly string[],
): CustomerUpdateDraft | null {
  if (!isRecord(value)) return null
  const customerId = optionalNullableString(value.customerId)
  const customerName = optionalString(value.customerName)
  const city = optionalString(value.city)
  const need = optionalString(value.need)
  if (customerId === undefined || customerName === undefined || city === undefined) return null
  if (value.need !== undefined && need === undefined) return null

  const draft: CustomerUpdateDraft = { customerId, customerName, city }
  if (need !== undefined) draft.need = need

  const stringFields = ['propertyType', 'household', 'sourceChannel', 'stylePreference', 'notes'] as const
  for (const field of stringFields) {
    const parsed = optionalString(value[field])
    if (value[field] !== undefined && parsed === undefined) return null
    if (parsed !== undefined) draft[field] = parsed
  }

  const budgetWan = optionalNumber(value.budgetWan)
  if (value.budgetWan !== undefined && budgetWan === undefined) return null
  if (budgetWan !== undefined) draft.budgetWan = budgetWan

  const areaSqm = optionalNumber(value.areaSqm)
  if (value.areaSqm !== undefined && areaSqm === undefined) return null
  if (areaSqm !== undefined) draft.areaSqm = areaSqm

  const stage = optionalCustomerStage(value.stage)
  if (value.stage !== undefined && stage === undefined) return null
  if (stage !== undefined) draft.stage = stage

  const needs = stringArray(value.needs)
  if (value.needs !== undefined && needs === undefined) return null
  if (needs !== undefined) draft.needs = needs

  const profileValues = profileValueMap(value.profileValues, allowedProfileKeys)
  if (value.profileValues !== undefined && profileValues === undefined) return null
  if (profileValues !== undefined) draft.profileValues = profileValues

  const normalizedDraft = normalizeCustomerUpdateDraft(draft)
  if (!hasCustomerUpdateChange(normalizedDraft)) return null
  return normalizedDraft
}

function parseBatchActionsPayload(
  value: unknown,
  allowedProfileKeys: readonly string[],
): { actions: AssistantBatchAction[] } | null {
  if (!isRecord(value)) return null
  if (!Array.isArray(value.actions)) return null

  const actions: AssistantBatchAction[] = []
  for (const rawAction of value.actions) {
    if (!isRecord(rawAction)) return null
    const kind = rawAction.kind
    const title = optionalString(rawAction.title)

    if (kind === 'update-customer') {
      const payload = parseUpdateCustomerPayload(rawAction.payload, allowedProfileKeys)
      if (!payload) return null
      actions.push({
        kind,
        requiresConfirmation: true,
        title: title ?? '模型客户更新草稿',
        payload,
      })
      continue
    }

    if (kind === 'create-interaction') {
      const payload = parseInteractionPayload(rawAction.payload)
      if (!payload) return null
      actions.push({
        kind,
        requiresConfirmation: true,
        title: title ?? '模型沟通记录草稿',
        payload,
      })
      continue
    }

    if (kind === 'create-reminder') {
      const payload = parseReminderDraft(rawAction.payload)
      if (!payload) return null
      actions.push({
        kind,
        requiresConfirmation: true,
        title: title ?? '模型提醒草稿',
        payload,
      })
      continue
    }

    return null
  }

  return actions.length ? { actions } : null
}

function hasCustomerUpdateChange(draft: CustomerUpdateDraft): boolean {
  return Boolean(
    draft.need?.trim() ||
      draft.needs?.length ||
      draft.budgetWan !== undefined ||
      draft.areaSqm !== undefined ||
      draft.propertyType?.trim() ||
      draft.household?.trim() ||
      draft.stage ||
      draft.sourceChannel?.trim() ||
      draft.stylePreference?.trim() ||
      draft.notes?.trim() ||
      hasProfileValues(draft.profileValues),
  )
}

function parseInteractionPayload(
  value: unknown,
): {
  customerId: string | null
  customerName: string
  channel: Interaction['channel']
  summary: string
  happenedAt: string
  nextAction: string
} | null {
  if (!isRecord(value)) return null
  const customerId = optionalNullableString(value.customerId)
  const customerName = optionalString(value.customerName)
  const channel = optionalInteractionChannel(value.channel)
  const summary = optionalString(value.summary)
  const happenedAt = optionalString(value.happenedAt)
  const nextAction = optionalString(value.nextAction)
  if (
    customerId === undefined ||
    customerName === undefined ||
    channel === undefined ||
    summary === undefined ||
    happenedAt === undefined ||
    nextAction === undefined
  ) {
    return null
  }

  return { customerId, customerName, channel, summary, happenedAt, nextAction }
}

function parseReminderDraft(value: unknown): ReminderDraft | null {
  if (!isRecord(value)) return null
  const customerId = optionalNullableString(value.customerId)
  const title = optionalString(value.title)
  const scheduledAt = optionalString(value.scheduledAt)

  if (customerId === undefined || title === undefined || scheduledAt === undefined) return null
  if (value.channel !== undefined && value.channel !== 'app-and-calendar') return null
  if (value.status !== undefined && value.status !== 'draft') return null

  return {
    customerId,
    title,
    scheduledAt,
    channel: 'app-and-calendar',
    status: 'draft',
  }
}

function isAgentCommandKind(value: unknown): value is AgentToolName {
  return typeof value === 'string' && AGENT_TOOL_NAMES.includes(value as AgentToolName)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return value
}

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function profileValueMap(
  value: unknown,
  allowedProfileKeys: readonly string[],
): Record<string, ProfileFieldPrimitiveValue> | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) return undefined

  const allowedKeySet = new Set(allowedProfileKeys)
  const parsed: Record<string, ProfileFieldPrimitiveValue> = {}
  for (const [key, rawValue] of Object.entries(value)) {
    if (!allowedKeySet.has(key)) return undefined
    const parsedValue = profilePrimitiveValue(rawValue)
    if (parsedValue === undefined) return undefined
    parsed[key] = parsedValue
  }

  return parsed
}

function profilePrimitiveValue(value: unknown): ProfileFieldPrimitiveValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) return value
  return undefined
}

function hasProfileValues(values: Record<string, ProfileFieldPrimitiveValue> | undefined): boolean {
  if (!values) return false
  return Object.values(values).some((value) => {
    if (value === null || value === undefined) return false
    if (typeof value === 'string') return value.trim().length > 0
    if (Array.isArray(value)) return value.length > 0
    return true
  })
}

function optionalCustomerStage(value: unknown): CustomerStage | undefined {
  return typeof value === 'string' && CUSTOMER_STAGES.includes(value as CustomerStage) ? (value as CustomerStage) : undefined
}

function optionalInteractionChannel(value: unknown): Interaction['channel'] | undefined {
  const channels: readonly Interaction['channel'][] = ['phone', 'wechat', 'site-visit', 'meeting', 'note']
  return typeof value === 'string' && channels.includes(value as Interaction['channel']) ? (value as Interaction['channel']) : undefined
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  if (value.some((entry) => typeof entry !== 'string')) return undefined
  return value
}
