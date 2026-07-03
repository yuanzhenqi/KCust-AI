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
    expect(guarded.command.title).toBe('本地客户查询结果')
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

  it('normalizes model update display fields from the matched local customer id', () => {
    const command: AssistantCommand = {
      kind: 'update-customer',
      requiresConfirmation: true,
      title: '模型客户需求更新草稿',
      payload: {
        customerId: 'c-zhang',
        customerName: '错误客户',
        city: '上海',
        need: '整体浴室',
      },
    }

    const guarded = applyModelCommandGuardrails(command, { customers, todos })

    expect(guarded.command.kind).toBe('update-customer')
    if (guarded.command.kind !== 'update-customer') throw new Error('expected update command')
    expect(guarded.command.payload).toMatchObject({
      customerId: 'c-zhang',
      customerName: '张总',
      city: '无锡',
      need: '整体浴室',
    })
    expect(guarded.toolTrace).toContain('local:normalize-customer')
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
    expect(guarded.toolTrace).toContain('local:block-missing-customer')
  })
})
