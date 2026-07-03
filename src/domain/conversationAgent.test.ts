import { describe, expect, it } from 'vitest'
import { runLocalAgentTurn } from './conversationAgent'
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
    lastInteractionAt: '2026-05-24T09:00:00.000+08:00',
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
    lastInteractionAt: '2026-05-22T09:00:00.000+08:00',
    createdAt: '2026-05-18T09:00:00.000+08:00',
    updatedAt: '2026-05-22T09:00:00.000+08:00',
    syncStatus: 'local',
  },
]
const todos: Todo[] = []
const now = '2026-05-25T21:00:00.000+08:00'

describe('conversation agent', () => {
  it('asks for missing customer fields before showing a create confirmation', () => {
    const result = runLocalAgentTurn('帮我新增一个客户', {
      customers,
      todos,
      now,
    })

    expect(result.command.kind).toBe('agent-answer')
    if (result.command.kind !== 'agent-answer') throw new Error('expected agent answer')
    expect(result.command.title).toBe('继续补充客户资料')
    expect(result.command.payload.message).toContain('还需要补充')
    expect(result.command.payload.message).toContain('城市')
    expect(result.command.payload.message).toContain('预算')
    expect(result.memory?.pendingCustomerDraft).toEqual({})
  })

  it('merges a follow-up customer description into the pending customer draft', () => {
    const firstTurn = runLocalAgentTurn('帮我新增一个客户', {
      customers,
      todos,
      now,
    })

    const secondTurn = runLocalAgentTurn('无锡，预算 50w，120 平高层，3 个人住，有小孩，考虑智能家居', {
      customers,
      todos,
      now,
      memory: firstTurn.memory,
    })

    expect(secondTurn.command.kind).toBe('create-customer')
    if (secondTurn.command.kind !== 'create-customer') throw new Error('expected create customer')
    expect(secondTurn.command.payload).toMatchObject({
      city: '无锡',
      budgetWan: 50,
      areaSqm: 120,
      propertyType: '高层',
      household: '3 个人住，有小孩',
      needs: ['智能家居'],
    })
    expect(secondTurn.memory).toBeNull()
  })

  it('keeps the original full create-customer command as a one-turn confirmation', () => {
    const result = runLocalAgentTurn(
      '帮我添加一个无锡的客户，预算 50w，是一套 120 平的高层，需求是 3 个人住，有小孩，考虑智能家居',
      {
        customers,
        todos,
        now,
      },
    )

    expect(result.command.kind).toBe('create-customer')
    if (result.command.kind !== 'create-customer') throw new Error('expected create customer')
    expect(result.command.payload).toMatchObject({
      city: '无锡',
      budgetWan: 50,
      areaSqm: 120,
      propertyType: '高层',
      household: '3 个人住，有小孩',
      needs: ['智能家居'],
    })
    expect(result.memory).toBeNull()
  })

  it('keeps structured partial fields while asking for the remaining customer fields', () => {
    const result = runLocalAgentTurn('新增一个苏州客户，来源小红书，预算 80w，喜欢现代简约风格', {
      customers,
      todos,
      now,
    })

    expect(result.command.kind).toBe('agent-answer')
    if (result.command.kind !== 'agent-answer') throw new Error('expected agent answer')
    expect(result.command.payload.message).toContain('苏州')
    expect(result.command.payload.message).toContain('80w')
    expect(result.command.payload.message).toContain('小红书')
    expect(result.command.payload.message).toContain('现代简约')
    expect(result.memory?.pendingCustomerDraft).toMatchObject({
      city: '苏州',
      budgetWan: 80,
      sourceChannel: '小红书',
      stylePreference: '现代简约',
    })
  })

  it('asks for missing customer identity before updating a need in multiple turns', () => {
    const firstTurn = runLocalAgentTurn('给无锡客户加一个整体浴室的需求', {
      customers,
      todos,
      now,
    })

    expect(firstTurn.command.kind).toBe('agent-answer')
    if (firstTurn.command.kind !== 'agent-answer') throw new Error('expected agent answer')
    expect(firstTurn.command.title).toBe('继续补充客户修改')
    expect(firstTurn.command.payload.message).toContain('客户姓名')
    expect(firstTurn.command.payload.message).toContain('张总')
    expect(firstTurn.command.payload.message).toContain('王先生')
    expect(firstTurn.memory?.pendingUpdateDraft).toMatchObject({
      city: '无锡',
      need: '整体浴室',
    })

    const secondTurn = runLocalAgentTurn('张总', {
      customers,
      todos,
      now,
      memory: firstTurn.memory,
    })

    expect(secondTurn.command.kind).toBe('update-customer')
    if (secondTurn.command.kind !== 'update-customer') throw new Error('expected update customer')
    expect(secondTurn.command.payload).toMatchObject({
      customerId: 'c-zhang',
      customerName: '张总',
      city: '无锡',
      need: '整体浴室',
    })
    expect(secondTurn.memory).toBeNull()
  })

  it('asks for a missing reminder time and merges it into a reminder draft', () => {
    const firstTurn = runLocalAgentTurn('提醒我和无锡的张总开会', {
      customers,
      todos,
      now,
    })

    expect(firstTurn.command.kind).toBe('agent-answer')
    if (firstTurn.command.kind !== 'agent-answer') throw new Error('expected agent answer')
    expect(firstTurn.command.title).toBe('继续补充提醒')
    expect(firstTurn.command.payload.message).toContain('提醒时间')
    expect(firstTurn.memory?.pendingReminderDraft).toMatchObject({
      city: '无锡',
      customerName: '张总',
      title: '和张总开会',
    })

    const secondTurn = runLocalAgentTurn('明天晚上八点', {
      customers,
      todos,
      now,
      memory: firstTurn.memory,
    })

    expect(secondTurn.command.kind).toBe('create-reminder')
    if (secondTurn.command.kind !== 'create-reminder') throw new Error('expected create reminder')
    expect(secondTurn.command.payload).toMatchObject({
      customerId: 'c-zhang',
      title: '和张总开会',
      scheduledAt: '2026-05-26T20:00:00.000+08:00',
    })
    expect(secondTurn.memory).toBeNull()
  })

  it('splits one instruction with multiple customers into separate confirmed actions', () => {
    const result = runLocalAgentTurn('张总预算调整为60万，王先生明天晚上八点提醒我发图纸', {
      customers,
      todos,
      now,
    })

    expect(result.command.kind).toBe('batch-actions')
    if (result.command.kind !== 'batch-actions') throw new Error('expected batch actions')
    expect(result.command.payload.actions).toHaveLength(2)
    expect(result.command.payload.actions[0]).toMatchObject({
      kind: 'update-customer',
      payload: {
        customerId: 'c-zhang',
        customerName: '张总',
        budgetWan: 60,
      },
    })
    expect(result.command.payload.actions[1]).toMatchObject({
      kind: 'create-reminder',
      payload: {
        customerId: 'c-wang',
        title: '给王先生发图纸',
        scheduledAt: '2026-05-26T20:00:00.000+08:00',
      },
    })
    expect(result.memory).toBeNull()
  })
})
