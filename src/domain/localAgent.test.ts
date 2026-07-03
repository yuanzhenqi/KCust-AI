import { describe, expect, it } from 'vitest'
import { runLocalAgent } from './localAgent'
import type { Customer, Interaction, Todo } from './types'

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

const hubeiCustomers: Customer[] = [
  {
    ...customers[0],
    id: 'c-wuhan',
    name: '周女士',
    city: '武汉',
    stage: '初聊',
    lastInteractionAt: '2026-05-24T09:00:00.000+08:00',
  },
  {
    ...customers[0],
    id: 'c-yichang',
    name: '陈先生',
    city: '宜昌',
    stage: '方案',
    lastInteractionAt: '2026-05-15T09:00:00.000+08:00',
  },
]

const interactions: Interaction[] = [
  {
    id: 'interaction-c-wuhan-1',
    customerId: 'c-wuhan',
    channel: 'wechat',
    summary: '客户拜托我们先出平面图',
    happenedAt: '2026-05-24T09:00:00.000+08:00',
    nextAction: '先出平面图',
    createdAt: '2026-05-24T09:00:00.000+08:00',
  },
]

describe('local customer agent', () => {
  it('answers a greeting as a normal local conversation', () => {
    const command = runLocalAgent('你好', {
      customers,
      todos,
      now: '2026-05-25T21:00:00.000+08:00',
    })

    expect(command.kind).toBe('agent-answer')
    if (command.kind !== 'agent-answer') throw new Error('expected agent answer')
    expect(command.requiresConfirmation).toBe(false)
    expect(command.payload.message).toContain('你好')
    expect(command.payload.message).toContain('新增客户')
    expect(command.payload.message).toContain('创建提醒')
    expect(command.payload.toolTrace).toEqual(['本地对话', '能力说明'])
  })

  it('answers a capability question as a normal local conversation', () => {
    const command = runLocalAgent('你能做什么', {
      customers,
      todos,
      now: '2026-05-25T21:00:00.000+08:00',
    })

    expect(command.kind).toBe('agent-answer')
    if (command.kind !== 'agent-answer') throw new Error('expected agent answer')
    expect(command.payload.message).toContain('客户增删改查')
    expect(command.payload.message).toContain('画像聚类')
    expect(command.payload.toolTrace).toEqual(['本地对话', '能力说明'])
  })

  it('answers which Hubei prefecture-level cities have active communicated customers', () => {
    const command = runLocalAgent('我现在在湖北省，告诉我这边哪些地级市有沟通中的客户', {
      customers: hubeiCustomers,
      todos,
      interactions,
      now: '2026-05-25T21:00:00.000+08:00',
    })

    expect(command.kind).toBe('agent-answer')
    if (command.kind !== 'agent-answer') throw new Error('expected agent answer')
    expect(command.payload.message).toContain('武汉')
    expect(command.payload.message).toContain('宜昌')
    expect(command.payload.message).toContain('周女士')
    expect(command.payload.toolTrace).toEqual(['本地客户筛选', '省份城市汇总'])
  })

  it('answers customers with pending communication actions', () => {
    const command = runLocalAgent('帮我查下，有没有最近要处理的客户', {
      customers: hubeiCustomers,
      todos,
      interactions,
      now: '2026-05-25T21:00:00.000+08:00',
    })

    expect(command.kind).toBe('agent-answer')
    if (command.kind !== 'agent-answer') throw new Error('expected agent answer')
    expect(command.payload.message).toContain('周女士')
    expect(command.payload.message).toContain('先出平面图')
  })

  it('answers customers not contacted for five days', () => {
    const command = runLocalAgent('有没有五天没联系的客户', {
      customers: hubeiCustomers,
      todos,
      interactions,
      now: '2026-05-25T21:00:00.000+08:00',
    })

    expect(command.kind).toBe('agent-answer')
    if (command.kind !== 'agent-answer') throw new Error('expected agent answer')
    expect(command.payload.message).toContain('陈先生')
    expect(command.payload.message).toContain('10 天')
  })

  it('answers who to follow up today using local todos and health scores', () => {
    const command = runLocalAgent('今天我该优先跟进谁', {
      customers,
      todos,
      now: '2026-05-25T21:00:00.000+08:00',
    })

    expect(command.kind).toBe('agent-answer')
    if (command.kind !== 'agent-answer') throw new Error('expected agent answer')
    expect(command.requiresConfirmation).toBe(false)
    expect(command.payload.message).toContain('优先跟进李女士')
    expect(command.payload.message).toContain('给李女士发送报价对比')
    expect(command.payload.message).toContain('存在逾期待办')
    expect(command.payload.toolTrace).toEqual(['本地待办扫描', '客户健康度评分', '下一步建议生成'])
  })

  it('answers a customer next-step question with stage-aware advice', () => {
    const command = runLocalAgent('张总下一步应该怎么跟进', {
      customers,
      todos,
      now: '2026-05-25T21:00:00.000+08:00',
    })

    expect(command.kind).toBe('agent-answer')
    if (command.kind !== 'agent-answer') throw new Error('expected agent answer')
    expect(command.payload.message).toContain('张总下一步建议')
    expect(command.payload.message).toContain('推进方案确认')
    expect(command.payload.message).toContain('健康度 100')
  })

  it('treats a named follow-up question as the previous next-step intent', () => {
    const command = runLocalAgent('那张总呢', {
      customers,
      todos,
      now: '2026-05-25T21:00:00.000+08:00',
    })

    expect(command.kind).toBe('agent-answer')
    if (command.kind !== 'agent-answer') throw new Error('expected agent answer')
    expect(command.payload.message).toContain('张总下一步建议')
    expect(command.payload.message).toContain('推进方案确认')
  })

  it('asks for clarification before updating a need when multiple customers match', () => {
    const command = runLocalAgent('无锡客户需要加一个整体浴室的需求', {
      customers: [
        ...customers,
        {
          ...customers[0],
          id: 'c-wang',
          name: '王先生',
          needs: ['智能家居'],
        },
      ],
      todos,
      now: '2026-05-25T21:00:00.000+08:00',
    })

    expect(command.kind).toBe('agent-answer')
    if (command.kind !== 'agent-answer') throw new Error('expected agent answer')
    expect(command.payload.message).toContain('我找到了 2 位无锡客户')
    expect(command.payload.message).toContain('张总')
    expect(command.payload.message).toContain('王先生')
    expect(command.payload.message).toContain('请补充客户姓名')
  })
})
