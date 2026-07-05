import { describe, expect, it, vi } from 'vitest'
import {
  createOpenAICompatibleModelClient,
  listOpenAICompatibleModels,
  testOpenAICompatibleConnection,
} from './openAIClient'
import { BUILT_IN_MODEL_BASE_URL } from './modelConfig'
import { DEFAULT_PROFILE_FIELD_DEFINITIONS } from './profileFields'
import type { AgentModelRequest } from './agentRuntime'

const request: AgentModelRequest = {
  input: '今天我该优先跟进谁？',
  now: '2026-05-25T21:00:00.000+08:00',
  apiKey: 'sk-runtime-key',
  modelConfig: {
    provider: 'openai-compatible',
    apiKey: 'sk-runtime-key',
    baseUrl: 'https://model.example.test/v1/',
    model: 'kcust-test-model',
  },
  tools: ['create-customer', 'query-customers', 'agent-answer', 'update-customer', 'create-interaction', 'create-reminder'],
  contextSummary: {
    now: '2026-05-25T21:00:00.000+08:00',
    profileFields: DEFAULT_PROFILE_FIELD_DEFINITIONS.map((field) => ({
      key: field.key,
      label: field.label,
      description: field.description,
      type: field.type,
      options: field.options,
      enabled: field.enabled,
      showInSummary: field.showInSummary,
      extractionHint: field.extractionHint,
    })),
    customers: [
      {
        id: 'c-li',
        name: '李女士',
        city: '苏州',
        budgetWan: 80,
        areaSqm: 180,
        propertyType: '别墅',
        household: '四口之家',
        stage: '报价',
        needs: ['全屋定制'],
        notes: '报价已发，等待确认。',
        nextFollowUpAt: '2026-05-27T10:00:00.000+08:00',
        lastInteractionAt: '2026-04-20T09:00:00.000+08:00',
      },
    ],
    todos: [
      {
        id: 'todo-li-quote',
        customerId: 'c-li',
        title: '给李女士发送报价对比',
        dueAt: '2026-05-25T18:00:00.000+08:00',
        completed: false,
      },
    ],
    interactions: [
      {
        id: 'interaction-c-li-1',
        customerId: 'c-li',
        channel: 'wechat',
        summary: '客户要求补充报价对比',
        happenedAt: '2026-05-24T09:00:00.000+08:00',
        nextAction: '补充报价对比',
      },
    ],
  },
  responseFormat: 'assistant-command-json',
}

type FakeFetch = (url: string, init: RequestInit) => Promise<Response>

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function htmlResponse(body = '<!doctype html><html><body>not json</body></html>'): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  })
}

function sseResponse(events: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(event))
        }
        controller.close()
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    },
  )
}

describe('createOpenAICompatibleModelClient', () => {
  it('posts an OpenAI-compatible chat completion request and returns message content', async () => {
    const fetchImpl = vi.fn<FakeFetch>().mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content: '{"kind":"agent-answer","payload":{"message":"优先跟进李女士","toolTrace":[]}}',
            },
          },
        ],
      }),
    )
    const client = createOpenAICompatibleModelClient(
      {
        apiKey: 'sk-config-key',
        baseUrl: 'https://model.example.test/v1/',
        model: 'kcust-test-model',
      },
      fetchImpl,
    )

    const result = await client(request)

    expect(result).toBe('{"kind":"agent-answer","payload":{"message":"优先跟进李女士","toolTrace":[]}}')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(url).toBe('https://model.example.test/v1/chat/completions')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer sk-config-key',
      'Content-Type': 'application/json',
    })

    const body = JSON.parse(String(init?.body))
    expect(body.model).toBe('kcust-test-model')
    expect(body.max_tokens).toBe(1200)
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0]).toMatchObject({ role: 'system' })
    expect(body.messages[0].content).toContain('只返回')
    expect(body.messages[0].content).toContain('JSON')
    expect(body.messages[0].content).toContain('create-customer')
    expect(body.messages[0].content).toContain('客户微信名')
    expect(body.messages[0].content).toContain('工地位于')
    expect(body.messages[0].content).toContain('今天第一次沟通')
    expect(body.messages[0].content).toContain('create-interaction')
    expect(body.messages[0].content).toContain('五天没联系')
    expect(body.messages[0].content).toContain('只基于客户摘要')
    expect(body.messages[1]).toMatchObject({ role: 'user' })
    expect(body.messages[1].content).toContain(request.input)
    expect(body.messages[1].content).toContain('李女士')
    expect(body.messages[1].content).toContain('客户摘要')
  })

  it('uses the built-in gateway defaults when baseUrl and model are omitted', async () => {
    const fetchImpl = vi.fn<FakeFetch>().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: '{"kind":"agent-answer","payload":{"message":"ok","toolTrace":[]}}' } }],
      }),
    )
    const client = createOpenAICompatibleModelClient({ apiKey: 'sk-defaults' }, fetchImpl)

    await client({ ...request, modelConfig: { provider: 'openai-compatible', apiKey: 'sk-defaults' } })

    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(url).toBe(`${BUILT_IN_MODEL_BASE_URL}/chat/completions`)
    expect(JSON.parse(String(init?.body)).model).toBe('MiniMax-M3')
  })

  it('streams OpenAI-compatible chat completion chunks when a stream handler is provided', async () => {
    const chunkHandler = vi.fn()
    const fetchImpl = vi.fn<FakeFetch>().mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"{\\"kind\\":\\"agent-answer\\","}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"\\"payload\\":{\\"message\\":\\"你好\\",\\"toolTrace\\":[]}"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"}"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    )
    const client = createOpenAICompatibleModelClient(
      {
        apiKey: 'sk-stream',
        baseUrl: 'https://model.example.test/v1/',
        model: 'kcust-test-model',
      },
      fetchImpl,
    )

    const result = await client({ ...request, onStreamChunk: chunkHandler })

    expect(result).toBe('{"kind":"agent-answer","payload":{"message":"你好","toolTrace":[]}}')
    expect(chunkHandler).toHaveBeenCalledTimes(3)
    expect(chunkHandler).toHaveBeenNthCalledWith(1, '{"kind":"agent-answer",')
    const [, init] = fetchImpl.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))).toMatchObject({
      stream: true,
    })
  })

  it('reads a JSON chat completion response when streaming is requested but the service returns JSON', async () => {
    const chunkHandler = vi.fn()
    const fetchImpl = vi.fn<FakeFetch>().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: '{"kind":"agent-answer","payload":{"message":"你好","toolTrace":[]}}' } }],
      }),
    )
    const client = createOpenAICompatibleModelClient(
      {
        apiKey: 'sk-json-stream',
        baseUrl: 'https://model.example.test/v1/',
        model: 'kcust-test-model',
      },
      fetchImpl,
    )

    const result = await client({ ...request, onStreamChunk: chunkHandler })

    expect(result).toBe('{"kind":"agent-answer","payload":{"message":"你好","toolTrace":[]}}')
    expect(chunkHandler).not.toHaveBeenCalled()
    const [, init] = fetchImpl.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))).toMatchObject({
      stream: true,
    })
  })

  it('throws a readable error when a streamed chat completion response is html', async () => {
    const fetchImpl = vi.fn<FakeFetch>().mockResolvedValue(htmlResponse())
    const client = createOpenAICompatibleModelClient({ apiKey: 'sk-stream-html' }, fetchImpl)

    await expect(client({ ...request, onStreamChunk: vi.fn() })).rejects.toThrow(
      '模型服务返回的不是 JSON，请检查模型 Base URL 是否为 OpenAI-compatible /v1 接口。',
    )
  })

  it('throws a readable error for non-2xx HTTP responses', async () => {
    const fetchImpl = vi.fn<FakeFetch>().mockResolvedValue(
      jsonResponse({ error: { message: 'invalid api key' } }, { status: 401, statusText: 'Unauthorized' }),
    )
    const client = createOpenAICompatibleModelClient({ apiKey: 'sk-bad' }, fetchImpl)

    await expect(client(request)).rejects.toThrow(
      /OpenAI-compatible chat completion failed: 401 Unauthorized: invalid api key/,
    )
  })

  it('throws a readable error when the response has no message content', async () => {
    const fetchImpl = vi.fn<FakeFetch>().mockResolvedValue(jsonResponse({ choices: [{ message: {} }] }))
    const client = createOpenAICompatibleModelClient({ apiKey: 'sk-empty' }, fetchImpl)

    await expect(client(request)).rejects.toThrow(/missing message content/i)
  })

  it('throws a readable error when the chat completion response is html', async () => {
    const fetchImpl = vi.fn<FakeFetch>().mockResolvedValue(htmlResponse())
    const client = createOpenAICompatibleModelClient({ apiKey: 'sk-html' }, fetchImpl)

    await expect(client(request)).rejects.toThrow(
      '模型服务返回的不是 JSON，请检查模型 Base URL 是否为 OpenAI-compatible /v1 接口。',
    )
  })

  it('times out stalled model requests with a readable error', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn<FakeFetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal
          if (!signal) {
            reject(new Error('missing abort signal'))
            return
          }
          signal.addEventListener('abort', () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            reject(error)
          })
        }),
    )
    const client = createOpenAICompatibleModelClient({ apiKey: 'sk-timeout', requestTimeoutMs: 10 }, fetchImpl)

    const result = expect(client(request)).rejects.toThrow('模型请求超时，请检查网络、Base URL 或模型 ID。')
    await vi.advanceTimersByTimeAsync(10)

    await result
    vi.useRealTimers()
  })

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

  it('returns a connection failure when the connectivity response is html', async () => {
    const fetchImpl = vi.fn<FakeFetch>().mockResolvedValue(htmlResponse())

    const result = await testOpenAICompatibleConnection({ apiKey: 'sk-html' }, fetchImpl)

    expect(result).toEqual({
      ok: false,
      message: '模型服务返回的不是 JSON，请检查模型 Base URL 是否为 OpenAI-compatible /v1 接口。',
    })
  })

  it('returns a missing api key result without calling fetch', async () => {
    const fetchImpl = vi.fn<FakeFetch>()

    const result = await testOpenAICompatibleConnection({ apiKey: '   ' }, fetchImpl)

    expect(result).toEqual({ ok: false, message: '请先填写模型 API Key' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns a readable connection failure when fetch rejects', async () => {
    const fetchImpl = vi.fn<FakeFetch>().mockRejectedValue(new Error('network down'))

    const result = await testOpenAICompatibleConnection({ apiKey: 'sk-network' }, fetchImpl)

    expect(result).toEqual({ ok: false, message: 'network down' })
  })

  it('lists OpenAI-compatible models from the configured base url', async () => {
    const fetchImpl = vi.fn<FakeFetch>().mockResolvedValue(
      jsonResponse({
        data: [
          { id: 'gpt-4.1-mini' },
          { id: 'deepseek-chat' },
          { id: '' },
          { name: 'missing-id' },
        ],
      }),
    )

    const result = await listOpenAICompatibleModels(
      {
        apiKey: 'sk-config-key',
        baseUrl: 'https://model.example.test/v1/',
        model: 'gpt-4.1-mini',
      },
      fetchImpl,
    )

    expect(result).toEqual({ ok: true, models: ['gpt-4.1-mini', 'deepseek-chat'] })
    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(url).toBe('https://model.example.test/v1/models')
    expect(init?.method).toBe('GET')
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer sk-config-key',
    })
  })

  it('returns a readable model list failure when api key is missing', async () => {
    const fetchImpl = vi.fn<FakeFetch>()

    const result = await listOpenAICompatibleModels({ apiKey: '   ' }, fetchImpl)

    expect(result).toEqual({ ok: false, message: '请先填写模型 API Key' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
