import { describe, expect, it, vi } from 'vitest'
import { runAgentCommand, type AgentModelClient } from './agentRuntime'
import type { Customer, Todo } from './types'

const now = '2026-05-25T21:00:00.000+08:00'

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
    notes: '关注儿童活动区。',
    nextFollowUpAt: '2026-05-26T20:00:00.000+08:00',
    lastInteractionAt: '2026-05-24T09:00:00.000+08:00',
    createdAt: '2026-05-20T09:00:00.000+08:00',
    updatedAt: '2026-05-24T09:00:00.000+08:00',
    syncStatus: 'local',
  },
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
    notes: '',
    nextFollowUpAt: '2026-05-27T10:00:00.000+08:00',
    lastInteractionAt: '2026-04-20T09:00:00.000+08:00',
    createdAt: '2026-04-01T09:00:00.000+08:00',
    updatedAt: '2026-04-20T09:00:00.000+08:00',
    syncStatus: 'local',
  },
]

const todos: Todo[] = [
  {
    id: 'todo-li-quote',
    customerId: 'c-li',
    title: '给李女士发送报价对比',
    dueAt: '2026-05-25T18:00:00.000+08:00',
    completed: false,
  },
]

describe('agent runtime', () => {
  it('uses the local rules agent when apiKey is missing', async () => {
    const modelClient = vi.fn<AgentModelClient>()

    const result = await runAgentCommand('今天我该优先跟进谁', {
      customers,
      todos,
      now,
      apiKey: '',
      isOnline: true,
      modelClient,
    })

    expect(modelClient).not.toHaveBeenCalled()
    expect(result.source).toBe('local')
    expect(result.command.kind).toBe('agent-answer')
    if (result.command.kind !== 'agent-answer') throw new Error('expected agent answer')
    expect(result.command.payload.message).toContain('优先跟进李女士')
    expect(result.toolTrace).toEqual(['本地待办扫描', '客户健康度评分', '下一步建议生成'])
  })

  it('uses the local rules agent when offline even with an apiKey', async () => {
    const modelClient = vi.fn<AgentModelClient>()

    const result = await runAgentCommand('今天我该优先跟进谁', {
      customers,
      todos,
      now,
      apiKey: 'sk-local-test',
      isOnline: false,
      modelClient,
    })

    expect(modelClient).not.toHaveBeenCalled()
    expect(result.source).toBe('local')
    expect(result.command.kind).toBe('agent-answer')
  })

  it('uses the local rules agent when apiKey is present and online but no model client is provided', async () => {
    const result = await runAgentCommand('今天我该优先跟进谁', {
      customers,
      todos,
      now,
      apiKey: 'sk-local-test',
      isOnline: true,
    })

    expect(result.source).toBe('local')
    expect(result.modelDisclosure).toBeUndefined()
    expect(result.command.kind).toBe('agent-answer')
    if (result.command.kind !== 'agent-answer') throw new Error('expected agent answer')
    expect(result.command.payload.message).toContain('优先跟进李女士')
  })

  it('uses the configured model for greeting chat when online', async () => {
    const modelClient = vi.fn<AgentModelClient>().mockResolvedValue(
      JSON.stringify({
        kind: 'agent-answer',
        requiresConfirmation: false,
        title: '模型 Agent',
        payload: { message: '你好，我可以帮你记录客户、查客户和安排提醒。', toolTrace: ['model:chat'] },
      }),
    )

    const result = await runAgentCommand('你好', {
      customers,
      todos,
      now,
      apiKey: 'sk-local-test',
      isOnline: true,
      modelClient,
    })

    expect(modelClient).toHaveBeenCalledTimes(1)
    expect(result.source).toBe('model')
    expect(result.modelDisclosure).toBeDefined()
    expect(result.command.kind).toBe('agent-answer')
    if (result.command.kind !== 'agent-answer') throw new Error('expected agent answer')
    expect(result.command.payload.message).toContain('你好')
  })

  it('uses the configured model before local rules for a recognizable business command', async () => {
    const modelClient = vi.fn<AgentModelClient>().mockResolvedValue(
      JSON.stringify({
        kind: 'create-customer',
        requiresConfirmation: true,
        title: '模型客户草稿',
        payload: {
          name: '未命名客户',
          city: '无锡',
          budgetWan: 50,
          areaSqm: 120,
          propertyType: '高层',
          household: '3 人住，有小孩',
          stage: '线索',
          needs: ['智能家居'],
          notes: '',
        },
      }),
    )

    const result = await runAgentCommand('帮我添加一个无锡客户，预算 50w，120 平高层，3 个人住，有小孩，考虑智能家居', {
      customers,
      todos,
      now,
      apiKey: 'sk-local-test',
      isOnline: true,
      modelClient,
    })

    expect(modelClient).toHaveBeenCalledTimes(1)
    expect(result.source).toBe('model')
    expect(result.command.kind).toBe('create-customer')
    expect(result.toolTrace).toContain('model:create-customer')
  })

  it('returns a model failure message when the configured model call fails', async () => {
    const result = await runAgentCommand('帮我分析这段没有本地规则的话', {
      customers,
      todos,
      now,
      apiKey: 'sk-local-test',
      isOnline: true,
      modelClient: vi.fn<AgentModelClient>().mockRejectedValue(new Error('network failed')),
    })

    expect(result.source).toBe('model')
    expect(result.command.kind).toBe('unknown')
    if (result.command.kind !== 'unknown') throw new Error('expected unknown command')
    expect(result.command.payload.message).toContain('模型调用失败')
    expect(result.command.payload.message).toContain('network failed')
    expect(result.command.payload.message).toContain('模型 ID')
    expect(result.modelDisclosure).toBeDefined()
    expect(result.toolTrace).toEqual(['model:request-failed'])
  })

  it('retries a failed model call up to three times before returning the model result', async () => {
    const events: string[] = []
    const modelClient = vi.fn<AgentModelClient>()
      .mockRejectedValueOnce(new Error('temporary outage 1'))
      .mockRejectedValueOnce(new Error('temporary outage 2'))
      .mockRejectedValueOnce(new Error('temporary outage 3'))
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'agent-answer',
          requiresConfirmation: false,
          title: '模型 Agent',
          payload: { message: '重试后已恢复。', toolTrace: ['model:agent-answer'] },
        }),
      )

    const result = await runAgentCommand('你好', {
      customers,
      todos,
      now,
      apiKey: 'sk-local-test',
      isOnline: true,
      modelClient,
      onStatus: (event) => events.push(`${event.kind}:${event.message}`),
    })

    expect(modelClient).toHaveBeenCalledTimes(4)
    expect(result.source).toBe('model')
    expect(result.command.kind).toBe('agent-answer')
    if (result.command.kind !== 'agent-answer') throw new Error('expected agent answer')
    expect(result.command.payload.message).toContain('重试后已恢复')
    expect(result.toolTrace).toEqual(['model:retry-1', 'model:retry-2', 'model:retry-3', 'model:agent-answer'])
    expect(events).toEqual([
      'model-start:开始调用模型 Agent',
      'model-retry:模型调用失败，正在进行第 1 次重试',
      'model-retry:模型调用失败，正在进行第 2 次重试',
      'model-retry:模型调用失败，正在进行第 3 次重试',
      'model-success:模型 Agent 已返回结果',
    ])
  })

  it('turns a valid model create-customer JSON response into a confirmation draft', async () => {
    const modelClient = vi.fn<AgentModelClient>().mockResolvedValue(
      JSON.stringify({
        kind: 'create-customer',
        requiresConfirmation: false,
        title: '模型客户草稿',
        payload: {
          name: '赵女士',
          city: '杭州',
          budgetWan: 90,
          areaSqm: 160,
          propertyType: '高层',
          household: '三口之家',
          stage: '线索',
          sourceChannel: '抖音',
          stylePreference: '奶油风',
          needs: ['智能家居'],
          notes: '关注收纳',
        },
      }),
    )

    const result = await runAgentCommand('新增赵女士', {
      customers,
      todos,
      now,
      apiKey: 'sk-local-test',
      isOnline: true,
      modelConfig: {
        baseUrl: 'https://model.example.test/v1',
        model: 'kcust-test-model',
      },
      modelClient,
    })

    expect(modelClient).toHaveBeenCalledTimes(1)
    expect(modelClient.mock.calls[0]?.[0]).toMatchObject({
      input: '新增赵女士',
      apiKey: 'sk-local-test',
      modelConfig: {
        provider: 'openai-compatible',
        apiKey: 'sk-local-test',
        baseUrl: 'https://model.example.test/v1',
        model: 'kcust-test-model',
      },
      contextSummary: {
        now,
        customers: expect.arrayContaining([
          expect.objectContaining({
            id: 'c-zhang',
            name: '张总',
            sourceChannel: expect.any(String),
            stylePreference: expect.any(String),
          }),
        ]),
      },
    })
    expect(result.source).toBe('model')
    expect(result.command.kind).toBe('create-customer')
    expect(result.command.requiresConfirmation).toBe(true)
    expect(result.command.title).toBe('模型客户草稿')
    if (result.command.kind !== 'create-customer') throw new Error('expected create customer')
    expect(result.command.payload).toMatchObject({
      name: '赵女士',
      city: '杭州',
      sourceChannel: '抖音',
      stylePreference: '奶油风',
      needs: ['智能家居'],
    })
    expect(result.modelDisclosure?.customerFields).toEqual(
      expect.arrayContaining(['sourceChannel', 'stylePreference']),
    )
    expect(result.toolTrace).toContain('model:create-customer')
  })

  it('returns an unknown command instead of throwing when model JSON is malformed', async () => {
    const result = await runAgentCommand('随便问一句', {
      customers,
      todos,
      now,
      apiKey: 'sk-local-test',
      isOnline: true,
      modelClient: vi.fn<AgentModelClient>().mockResolvedValue('{bad json'),
    })

    expect(result.source).toBe('model')
    expect(result.command.kind).toBe('unknown')
    expect(result.command.requiresConfirmation).toBe(false)
    if (result.command.kind !== 'unknown') throw new Error('expected unknown command')
    expect(result.command.payload.message).toContain('无法解析')
  })

  it('returns an unknown command when model JSON has an unsupported kind', async () => {
    const result = await runAgentCommand('删除所有客户', {
      customers,
      todos,
      now,
      apiKey: 'sk-local-test',
      isOnline: true,
      modelClient: vi.fn<AgentModelClient>().mockResolvedValue(
        JSON.stringify({
          kind: 'delete-customer',
          requiresConfirmation: false,
          title: '危险操作',
          payload: { customerId: 'c-zhang' },
        }),
      ),
    })

    expect(result.source).toBe('model')
    expect(result.command.kind).toBe('unknown')
    expect(result.command.requiresConfirmation).toBe(false)
    if (result.command.kind !== 'unknown') throw new Error('expected unknown command')
    expect(result.command.payload.message).toContain('未知指令')
  })

  it('keeps structured fields from a valid model customer update response', async () => {
    const result = await runAgentCommand('张总预算调整为60万，家里4人住，养猫', {
      customers,
      todos,
      now,
      apiKey: 'sk-local-test',
      isOnline: true,
      modelClient: vi.fn<AgentModelClient>().mockResolvedValue(
        JSON.stringify({
          kind: 'update-customer',
          requiresConfirmation: true,
          title: '模型客户更新草稿',
          payload: {
            customerId: 'c-zhang',
            customerName: '张总',
            city: '无锡',
            need: '家里有宠物',
            budgetWan: 60,
            household: '4 人住',
          },
        }),
      ),
    })

    expect(result.source).toBe('model')
    expect(result.command.kind).toBe('update-customer')
    if (result.command.kind !== 'update-customer') throw new Error('expected update command')
    expect(result.command.payload).toMatchObject({
      customerId: 'c-zhang',
      customerName: '张总',
      city: '无锡',
      need: '家里有宠物',
      budgetWan: 60,
      household: '4 人住',
    })
  })

  it('passes custom profile fields to the model and accepts profileValues in updates', async () => {
    const modelClient = vi.fn<AgentModelClient>().mockResolvedValue(
      JSON.stringify({
        kind: 'update-customer',
        requiresConfirmation: true,
        title: '模型客户画像更新草稿',
        payload: {
          customerId: 'c-zhang',
          customerName: '张总',
          city: '无锡',
          profileValues: {
            decisionMaker: '李总',
          },
        },
      }),
    )

    const result = await runAgentCommand('张总这单最终决策人是李总', {
      customers,
      todos,
      now,
      apiKey: 'sk-local-test',
      isOnline: true,
      profileFields: [
        {
          id: 'profile-field-decisionMaker',
          key: 'decisionMaker',
          label: '决策人',
          description: '最终拍板的人',
          type: 'text',
          enabled: true,
          showInSummary: true,
          extractionHint: '提取最终拍板或主要决策的人',
          order: 1,
        },
      ],
      modelClient,
    })

    expect(modelClient.mock.calls[0]?.[0].contextSummary.profileFields).toEqual([
      expect.objectContaining({
        key: 'decisionMaker',
        label: '决策人',
        extractionHint: '提取最终拍板或主要决策的人',
      }),
    ])
    expect(result.command.kind).toBe('update-customer')
    if (result.command.kind !== 'update-customer') throw new Error('expected update command')
    expect(result.command.payload.profileValues).toEqual({ decisionMaker: '李总' })
    expect(result.modelDisclosure?.profileFieldKeys).toEqual(['decisionMaker'])
  })

  it('does not send hidden profile fields to the model context', async () => {
    const modelClient = vi.fn<AgentModelClient>().mockResolvedValue(
      JSON.stringify({
        kind: 'agent-answer',
        requiresConfirmation: false,
        title: '模型 Agent',
        payload: { message: '已收到。', toolTrace: [] },
      }),
    )

    await runAgentCommand('你好', {
      customers,
      todos,
      now,
      apiKey: 'sk-local-test',
      isOnline: true,
      profileFields: [
        {
          id: 'profile-field-decisionMaker',
          key: 'decisionMaker',
          label: '决策人',
          description: '最终拍板的人',
          type: 'text',
          enabled: true,
          showInSummary: true,
          extractionHint: '提取最终拍板或主要决策的人',
          order: 1,
        },
        {
          id: 'profile-field-household',
          key: 'household',
          label: '家庭结构',
          description: '客户家庭成员',
          type: 'text',
          enabled: false,
          showInSummary: false,
          extractionHint: '提取家庭结构',
          order: 2,
        },
      ],
      modelClient,
    })

    expect(modelClient.mock.calls[0]?.[0].contextSummary.profileFields.map((field) => field.key)).toEqual([
      'decisionMaker',
    ])
  })

  it('rejects model profileValues that are not configured as profile fields', async () => {
    const result = await runAgentCommand('张总这单最终决策人是李总', {
      customers,
      todos,
      now,
      apiKey: 'sk-local-test',
      isOnline: true,
      profileFields: [
        {
          id: 'profile-field-decisionMaker',
          key: 'decisionMaker',
          label: '决策人',
          description: '最终拍板的人',
          type: 'text',
          enabled: true,
          showInSummary: true,
          extractionHint: '提取最终拍板或主要决策的人',
          order: 1,
        },
      ],
      modelClient: vi.fn<AgentModelClient>().mockResolvedValue(
        JSON.stringify({
          kind: 'update-customer',
          requiresConfirmation: true,
          title: '模型客户画像更新草稿',
          payload: {
            customerId: 'c-zhang',
            customerName: '张总',
            city: '无锡',
            profileValues: {
              unconfiguredProfileKey: '李总',
            },
          },
        }),
      ),
    })

    expect(result.command.kind).toBe('unknown')
    if (result.command.kind !== 'unknown') throw new Error('expected unknown command')
    expect(result.command.payload.message).toContain('字段不完整')
  })

  it('returns a non-confirming unknown command when model JSON has a valid kind but invalid payload', async () => {
    const result = await runAgentCommand('新增赵女士', {
      customers,
      todos,
      now,
      apiKey: 'sk-local-test',
      isOnline: true,
      modelClient: vi.fn<AgentModelClient>().mockResolvedValue(
        JSON.stringify({
          kind: 'create-customer',
          requiresConfirmation: true,
          title: '模型客户草稿',
          payload: {
            name: '赵女士',
            city: '杭州',
            budgetWan: '九十万',
          },
        }),
      ),
    })

    expect(result.source).toBe('model')
    expect(result.command.kind).toBe('unknown')
    expect(result.command.requiresConfirmation).toBe(false)
    if (result.command.kind !== 'unknown') throw new Error('expected unknown command')
    expect(result.command.payload.message).toContain('字段不完整')
  })

  it('rejects model update and reminder payloads with blank customer ids', async () => {
    const updateResult = await runAgentCommand('给客户加整体浴室', {
      customers,
      todos,
      now,
      apiKey: 'sk-local-test',
      isOnline: true,
      modelClient: vi.fn<AgentModelClient>().mockResolvedValue(
        JSON.stringify({
          kind: 'update-customer',
          requiresConfirmation: true,
          title: '模型客户需求更新草稿',
          payload: {
            customerId: '   ',
            customerName: '张总',
            city: '无锡',
            need: '整体浴室',
          },
        }),
      ),
    })

    expect(updateResult.command.kind).toBe('unknown')
    if (updateResult.command.kind !== 'unknown') throw new Error('expected unknown command')
    expect(updateResult.command.payload.message).toContain('字段不完整')

    const reminderResult = await runAgentCommand('模型帮我规划会议动作', {
      customers,
      todos,
      now,
      apiKey: 'sk-local-test',
      isOnline: true,
      modelClient: vi.fn<AgentModelClient>().mockResolvedValue(
        JSON.stringify({
          kind: 'create-reminder',
          requiresConfirmation: true,
          title: '模型提醒草稿',
          payload: {
            customerId: '',
            title: '和客户开会',
            scheduledAt: '2026-06-08T20:00:00.000+08:00',
            channel: 'app-and-calendar',
            status: 'draft',
          },
        }),
      ),
    })

    expect(reminderResult.command.kind).toBe('unknown')
    if (reminderResult.command.kind !== 'unknown') throw new Error('expected unknown command')
    expect(reminderResult.command.payload.message).toContain('字段不完整')
  })

  it('keeps model query and agent-answer responses non-confirming', async () => {
    const queryResult = await runAgentCommand('请用模型整理无锡客户摘要', {
      customers,
      todos,
      now,
      apiKey: 'sk-local-test',
      isOnline: true,
      modelClient: vi.fn<AgentModelClient>().mockResolvedValue(
        JSON.stringify({
          kind: 'query-customers',
          requiresConfirmation: true,
          title: '模型查询结果',
          payload: { city: '无锡', resultSummary: '张总｜无锡｜50w' },
        }),
      ),
    })

    expect(queryResult.source).toBe('model')
    expect(queryResult.command.kind).toBe('query-customers')
    expect(queryResult.command.requiresConfirmation).toBe(false)

    const answerResult = await runAgentCommand('今天怎么安排', {
      customers,
      todos,
      now,
      apiKey: 'sk-local-test',
      isOnline: true,
      modelClient: vi.fn<AgentModelClient>().mockResolvedValue(
        JSON.stringify({
          kind: 'agent-answer',
          requiresConfirmation: true,
          title: '模型 Agent 建议',
          payload: { message: '先跟进李女士。', toolTrace: ['模型待办扫描'] },
        }),
      ),
    })

    expect(answerResult.source).toBe('model')
    expect(answerResult.command.kind).toBe('agent-answer')
    expect(answerResult.command.requiresConfirmation).toBe(false)
    if (answerResult.command.kind !== 'agent-answer') throw new Error('expected agent answer')
    expect(answerResult.command.payload.toolTrace).toEqual(['模型待办扫描'])
  })

  it('grounds model customer query responses before returning them to the app', async () => {
    const result = await runAgentCommand('请用模型整理无锡客户摘要', {
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
    expect(result.command.title).toBe('本地客户查询结果')
    expect(result.command.payload.resultSummary).toContain('张总')
    expect(result.command.payload.resultSummary).not.toContain('模型编造客户')
    expect(result.toolTrace).toContain('model:query-customers')
    expect(result.toolTrace).toContain('local:ground-query')
  })
})
