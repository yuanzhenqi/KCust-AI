import { describe, expect, it } from 'vitest'
import {
  addNeedToBestCustomerMatch,
  applyCustomerUpdateToBestMatch,
  buildNextStepSuggestion,
  buildCustomerClusters,
  createCustomerFromDraft,
  createReminderDraft,
  filterCustomersByCity,
  scoreCustomerHealth,
  summarizeCustomers,
} from './customerLogic'
import type { Customer } from './types'

const baseCustomers: Customer[] = [
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
    notes: '偏现代简约',
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
    needs: ['全屋定制', '中央空调'],
    notes: '',
    nextFollowUpAt: null,
    lastInteractionAt: '2026-04-20T09:00:00.000+08:00',
    createdAt: '2026-04-01T09:00:00.000+08:00',
    updatedAt: '2026-04-20T09:00:00.000+08:00',
    syncStatus: 'local',
  },
]

describe('customer domain behavior', () => {
  it('creates a structured customer from the Wuxi smart-home command draft', () => {
    const customer = createCustomerFromDraft(
      {
        city: '无锡',
        budgetWan: 50,
        areaSqm: 120,
        propertyType: '高层',
        household: '3 个人住，有小孩',
        needs: ['智能家居'],
      },
      '2026-05-25T21:00:00.000+08:00',
    )

    expect(customer).toMatchObject({
      city: '无锡',
      budgetWan: 50,
      areaSqm: 120,
      propertyType: '高层',
      household: '3 个人住，有小孩',
      stage: '线索',
      needs: ['智能家居'],
      syncStatus: 'local',
    })
    expect(customer.name).toBe('未命名客户')
    expect(customer.id).toMatch(/^cust-/)
  })

  it('answers Wuxi customer queries only from local customer records', () => {
    const wuxiCustomers = filterCustomersByCity(baseCustomers, '无锡')

    expect(wuxiCustomers).toHaveLength(1)
    expect(summarizeCustomers(wuxiCustomers)).toContain('张总')
    expect(summarizeCustomers(wuxiCustomers)).toContain('50w')
    expect(summarizeCustomers(wuxiCustomers)).not.toContain('李女士')
  })

  it('adds a bathroom need to the best matching Wuxi Zhang customer', () => {
    const result = addNeedToBestCustomerMatch(baseCustomers, {
      city: '无锡',
      nameHint: '张总',
      need: '整体浴室',
      now: '2026-05-25T21:05:00.000+08:00',
    })

    expect(result.updatedCustomer?.id).toBe('c-zhang')
    expect(result.updatedCustomer?.needs).toEqual(['智能家居', '整体浴室'])
    expect(result.customers.find((customer) => customer.id === 'c-li')?.needs).toEqual([
      '全屋定制',
      '中央空调',
    ])
  })

  it('applies structured customer profile updates to the best matching customer', () => {
    const result = applyCustomerUpdateToBestMatch(baseCustomers, {
      customerId: null,
      city: '无锡',
      customerName: '张总',
      need: '家里有宠物',
      budgetWan: 60,
      household: '4 人住',
      now: '2026-05-25T21:05:00.000+08:00',
    })

    expect(result.updatedCustomer?.id).toBe('c-zhang')
    expect(result.updatedCustomer).toMatchObject({
      budgetWan: 60,
      household: '4 人住',
      updatedAt: '2026-05-25T21:05:00.000+08:00',
    })
    expect(result.updatedCustomer?.needs).toEqual(['智能家居', '家里有宠物'])
    expect(result.customers.find((customer) => customer.id === 'c-li')).toEqual(baseCustomers[1])
  })

  it('applies custom profile values to the matched customer', () => {
    const result = applyCustomerUpdateToBestMatch(baseCustomers, {
      customerId: 'c-zhang',
      customerName: '张总',
      city: '无锡',
      profileValues: {
        decisionMaker: '李总',
      },
      now: '2026-05-25T21:05:00.000+08:00',
    })

    expect(result.updatedCustomer?.profileValues?.decisionMaker).toMatchObject({
      value: '李总',
      updatedAt: '2026-05-25T21:05:00.000+08:00',
    })
  })

  it('normalizes profile facts when the model sends them as need text', () => {
    const result = applyCustomerUpdateToBestMatch(
      [{ ...baseCustomers[0], budgetWan: null, household: '', needs: ['智能家居'] }],
      {
        customerId: 'c-zhang',
        customerName: '张总',
        city: '无锡',
        need: '预算调整为50万；家里有4口人；养了一只猫（宠物）',
        now: '2026-05-25T21:05:00.000+08:00',
      },
    )

    expect(result.updatedCustomer).toMatchObject({
      budgetWan: 50,
      household: '4 人住',
    })
    expect(result.updatedCustomer?.needs).toEqual(['智能家居', '家里有宠物'])
    expect(result.updatedCustomer?.needs).not.toContain('预算调整为50万；家里有4口人；养了一只猫（宠物）')
  })

  it('creates a reminder draft for tomorrow evening tied to the matched customer', () => {
    const draft = createReminderDraft({
      customers: baseCustomers,
      city: '无锡',
      nameHint: '张总',
      title: '和张总开会',
      naturalTime: '明天晚上八点',
      now: '2026-05-25T21:00:00.000+08:00',
    })

    expect(draft).toMatchObject({
      customerId: 'c-zhang',
      title: '和张总开会',
      scheduledAt: '2026-05-26T20:00:00.000+08:00',
      channel: 'app-and-calendar',
      status: 'draft',
    })
  })

  it('parses common reminder day and hour phrases into local reminder times', () => {
    const cases = [
      ['今天下午3点', '2026-05-25T15:00:00.000+08:00'],
      ['明天9点', '2026-05-26T09:00:00.000+08:00'],
      ['后天上午10点', '2026-05-27T10:00:00.000+08:00'],
      ['明晚八点', '2026-05-26T20:00:00.000+08:00'],
      ['6月30号下午3点', '2026-06-30T15:00:00.000+08:00'],
    ] as const

    for (const [naturalTime, scheduledAt] of cases) {
      const draft = createReminderDraft({
        customers: baseCustomers,
        city: '无锡',
        nameHint: '张总',
        title: '和张总开会',
        naturalTime,
        now: '2026-05-25T21:00:00.000+08:00',
      })

      expect(draft.scheduledAt).toBe(scheduledAt)
    }
  })

  it('scores stale or incomplete customers lower and explains why', () => {
    const healthy = scoreCustomerHealth(baseCustomers[0], [], '2026-05-25T21:00:00.000+08:00')
    const stale = scoreCustomerHealth(
      { ...baseCustomers[1], household: '', nextFollowUpAt: null },
      [{ id: 'todo-1', customerId: 'c-li', title: '回访报价', dueAt: '2026-05-01T10:00:00.000+08:00', completed: false }],
      '2026-05-25T21:00:00.000+08:00',
    )

    expect(healthy.score).toBeGreaterThan(stale.score)
    expect(stale.reasons).toContain('超过 30 天未互动')
    expect(stale.reasons).toContain('存在逾期待办')
    expect(stale.reasons).toContain('家庭结构未完善')
  })

  it('prioritizes overdue todo in the next-step suggestion', () => {
    const suggestion = buildNextStepSuggestion(
      baseCustomers[1],
      [{ id: 'todo-1', customerId: 'c-li', title: '回访报价', dueAt: '2026-05-01T10:00:00.000+08:00', completed: false }],
      '2026-05-25T21:00:00.000+08:00',
    )

    expect(suggestion).toContain('先处理逾期待办')
    expect(suggestion).toContain('回访报价')
  })

  it('suggests a stage-aware action when there is no overdue todo', () => {
    const suggestion = buildNextStepSuggestion(baseCustomers[0], [], '2026-05-25T21:00:00.000+08:00')

    expect(suggestion).toContain('推进方案确认')
    expect(suggestion).toContain('预算')
  })

  it('clusters customers by similar city, budget, area, household and needs', () => {
    const clusters = buildCustomerClusters([
      ...baseCustomers,
      {
        ...baseCustomers[0],
        id: 'c-wang',
        name: '王先生',
        budgetWan: 55,
        areaSqm: 125,
        needs: ['智能家居', '全屋定制'],
      },
    ])

    expect(clusters[0].customerIds).toEqual(expect.arrayContaining(['c-zhang', 'c-wang']))
    expect(clusters[0].label).toContain('无锡')
    expect(clusters[0].label).toContain('智能家居')
  })
})
