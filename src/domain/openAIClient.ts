import type { AgentModelClient, AgentModelRequest } from './agentRuntime'
import { DEFAULT_MODEL_CONFIG, normalizeModelConfig } from './modelConfig'

export interface OpenAICompatibleModelClientConfig {
  apiKey: string
  baseUrl?: string
  model?: string
  requestTimeoutMs?: number
}

type FetchImpl = (url: string, init: RequestInit) => Promise<Response>

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown
    }
  }>
}

interface ChatCompletionStreamEvent {
  choices?: Array<{
    delta?: {
      content?: unknown
    }
    message?: {
      content?: unknown
    }
  }>
}

interface ModelListResponse {
  data?: Array<{
    id?: unknown
  }>
}

const DEFAULT_BASE_URL = DEFAULT_MODEL_CONFIG.baseUrl
const DEFAULT_MODEL = DEFAULT_MODEL_CONFIG.model
const DEFAULT_REQUEST_TIMEOUT_MS = 25_000

export function createOpenAICompatibleModelClient(
  config: OpenAICompatibleModelClientConfig,
  fetchImpl: FetchImpl = fetch,
): AgentModelClient {
  return async (request: AgentModelRequest): Promise<string> => {
    const normalized = normalizeModelConfig({
      baseUrl: config.baseUrl ?? request.modelConfig.baseUrl ?? DEFAULT_BASE_URL,
      model: config.model ?? request.modelConfig.model ?? DEFAULT_MODEL,
    })
    const abortController = typeof AbortController === 'undefined' ? null : new AbortController()
    const timeoutId: ReturnType<typeof setTimeout> | null = abortController
      ? setTimeout(() => abortController.abort(), normalizeRequestTimeoutMs(config.requestTimeoutMs))
      : null
    let response: Response

    try {
      response = await fetchImpl(`${normalized.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: abortController?.signal,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: normalized.model,
          max_tokens: 1200,
          ...(request.onStreamChunk ? { stream: true } : {}),
          messages: buildMessages(request),
        }),
      })
    } catch (error) {
      if (isAbortError(error)) throw new Error('模型请求超时，请检查网络、Base URL 或模型 ID。', { cause: error })
      throw error
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId)
    }

    if (!response.ok) {
      throw new Error(await describeHttpError(response))
    }

    if (request.onStreamChunk && isEventStreamResponse(response)) {
      return readStreamingMessageContent(response, request.onStreamChunk)
    }

    return readMessageContent(await readChatCompletionJson(response))
  }
}

function isEventStreamResponse(response: Response): boolean {
  return response.headers.get('Content-Type')?.toLowerCase().includes('text/event-stream') ?? false
}

function normalizeRequestTimeoutMs(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : DEFAULT_REQUEST_TIMEOUT_MS
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export interface ModelConnectionTestResult {
  ok: boolean
  message?: string
}

export interface ModelListResult {
  ok: boolean
  models?: string[]
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

    readMessageContent(await readChatCompletionJson(response))

    return { ok: true }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '模型连接测试失败' }
  }
}

export async function listOpenAICompatibleModels(
  config: Partial<OpenAICompatibleModelClientConfig>,
  fetchImpl: FetchImpl = fetch,
): Promise<ModelListResult> {
  try {
    const normalized = normalizeModelConfig(config)
    const apiKey = config.apiKey?.trim() ?? ''
    if (!apiKey) return { ok: false, message: '请先填写模型 API Key' }

    const response = await fetchImpl(`${normalized.baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      return { ok: false, message: await describeHttpError(response) }
    }

    const data = await readModelListJson(response)
    const models = data.data?.map((item) => item.id).filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim()) ?? []

    return { ok: true, models }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '模型列表获取失败' }
  }
}

async function readChatCompletionJson(response: Response): Promise<ChatCompletionResponse> {
  try {
    return (await response.json()) as ChatCompletionResponse
  } catch (error) {
    throw new Error('模型服务返回的不是 JSON，请检查模型 Base URL 是否为 OpenAI-compatible /v1 接口。', {
      cause: error,
    })
  }
}

async function readModelListJson(response: Response): Promise<ModelListResponse> {
  try {
    return (await response.json()) as ModelListResponse
  } catch (error) {
    throw new Error('模型服务返回的模型列表不是 JSON，请检查模型 Base URL 是否为 OpenAI-compatible /v1 接口。', {
      cause: error,
    })
  }
}

function readMessageContent(data: ChatCompletionResponse): string {
  const content = data.choices?.[0]?.message?.content

  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('OpenAI-compatible chat completion response missing message content.')
  }

  return content
}

async function readStreamingMessageContent(response: Response, onStreamChunk: (chunk: string) => void): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('模型服务未返回可读取的流式响应。')

  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let done = false

  while (!done) {
    const result = await reader.read()
    done = result.done
    buffer += decoder.decode(result.value ?? new Uint8Array(), { stream: !done })
    const events = buffer.split(/\n\n/)
    buffer = events.pop() ?? ''

    for (const event of events) {
      const chunk = readSseContentDelta(event)
      if (chunk === null) continue
      content += chunk
      onStreamChunk(chunk)
    }
  }

  const tail = buffer.trim()
  if (tail) {
    const chunk = readSseContentDelta(tail)
    if (chunk !== null) {
      content += chunk
      onStreamChunk(chunk)
    }
  }

  if (!content.trim()) {
    throw new Error('OpenAI-compatible chat completion response missing message content.')
  }

  return content
}

function readSseContentDelta(event: string): string | null {
  const data = event
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n')

  if (!data || data === '[DONE]') return null

  let parsed: ChatCompletionStreamEvent
  try {
    parsed = JSON.parse(data) as ChatCompletionStreamEvent
  } catch (error) {
    throw new Error('模型流式响应不是有效 JSON，请检查模型 Base URL 是否为 OpenAI-compatible /v1 接口。', {
      cause: error,
    })
  }

  const content = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content
  return typeof content === 'string' ? content : null
}

function buildMessages(request: AgentModelRequest): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content: [
        '你是家装客户管理个人助理 App 的模型 Agent。',
        '只返回一个符合工具契约的 JSON 对象，不要返回 Markdown、解释、代码块或额外文本。',
        `可用工具 kind: ${request.tools.join(', ')}。`,
        '顶层 JSON 必须包含 kind、requiresConfirmation、title、payload；可选 toolTrace。',
        '所有会创建或修改客户/提醒的操作必须让 requiresConfirmation 为 true。',
        '只基于客户摘要、待办摘要和沟通摘要回答客户查询；不得编造不存在的客户、待办或沟通记录。',
        '普通问候、闲聊、能力询问、配置询问，返回 agent-answer，payload 为 { "message": string, "toolTrace": string[] }。',
        'contextSummary.profileFields 是用户配置的客户画像字段定义。create-customer 和 update-customer 的 payload 可以包含 profileValues；profileValues 的键必须来自 contextSummary.profileFields[].key，值必须按字段 type 返回 string、number、boolean、string[] 或 null。',
        '当用户表达的信息能匹配 profileFields 的 label、description 或 extractionHint 时，把它写入 profileValues；固定字段 budgetWan、household、sourceChannel、stylePreference、nextFollowUpAt 仍优先写入同名固定字段，同时也可以在 profileValues 中写入非固定自定义字段。',
        '记录客户信息时，理解这些常见说法：客户微信名、需求内容为、工地位于、城市、需求日期、今天第一次沟通、沟通内容、是否希望加急、是否有服务价值。',
        '首次记录新客户时返回 create-customer，payload 可包含 name、wechatName、city、budgetWan、areaSqm、propertyType、household、stage、sourceChannel、stylePreference、needs、notes、demandDate、urgent、serviceValue、firstInteractionAt、firstInteractionSummary、nextAction、profileValues。',
        '如果用户说第二次或后续沟通，例如“某客户 今天沟通一次 沟通内容...”，返回 create-interaction，payload 为 { "customerId": string|null, "customerName": string, "channel": "phone"|"wechat"|"site-visit"|"meeting"|"note", "summary": string, "happenedAt": string, "nextAction": string }。',
        '如果用户要追加或修改客户资料，例如“张总需要加整体浴室”“预算调整为60万”“家里有4口人”“养了一只猫”，返回 update-customer，payload 为 { "customerId": string|null, "customerName": string, "city": string, "need"?: string, "needs"?: string[], "budgetWan"?: number, "areaSqm"?: number, "propertyType"?: string, "household"?: string, "stage"?: string, "sourceChannel"?: string, "stylePreference"?: string, "notes"?: string, "profileValues"?: Record<string,string|number|boolean|string[]|null> }。',
        '如果用户问“我在湖北省哪些地级市有沟通中的客户”“有没有最近要处理的客户”“有没有五天没联系的客户”，返回 agent-answer，并从 contextSummary.customers、contextSummary.todos、contextSummary.interactions 计算后作答。',
        '如果用户问某城市客户清单，例如“我在无锡有哪些客户”，返回 query-customers，payload 为 { "city": string, "resultSummary": string }。',
        '如果用户要求几月几号去工地、给图纸、开会或提醒，返回 create-reminder，payload 为 { "customerId": string|null, "title": string, "scheduledAt": string, "channel": "app-and-calendar", "status": "draft" }。',
        '如果一句话同时涉及多个客户或多个动作，返回 batch-actions，payload 为 { "actions": [update-customer 或 create-interaction 或 create-reminder 工具对象] }，每个动作必须独立包含 kind、title、payload。',
        '所有相对时间必须用用户消息和当前时间换算为带时区的 ISO 字符串；如果时间缺失或不可确定，返回 agent-answer 询问缺失信息。',
        '匹配客户时优先使用 contextSummary.customers 的 id；如果客户不唯一或没有找到，customerId 用 null，并在 title 或 payload 中保留用户提到的 customerName 与 city。',
        `响应格式: ${request.responseFormat}。`,
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `用户输入: ${request.input}`,
        `当前时间: ${request.now}`,
        '数据披露: 仅发送客户摘要和待办摘要字段给模型，用于生成助手工具 JSON。',
        `客户摘要与待办摘要: ${JSON.stringify(request.contextSummary)}`,
      ].join('\n'),
    },
  ]
}

async function describeHttpError(response: Response): Promise<string> {
  const detail = await readErrorDetail(response)
  const prefix = `OpenAI-compatible chat completion failed: ${response.status} ${response.statusText}`.trim()
  return detail ? `${prefix}: ${detail}` : prefix
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body = await response.text()
    if (!body) return ''

    try {
      const parsed = JSON.parse(body) as { error?: { message?: unknown }; message?: unknown }
      const message = parsed.error?.message ?? parsed.message
      return typeof message === 'string' ? message : body
    } catch {
      return body
    }
  } catch {
    return ''
  }
}
