import { describe, expect, it } from 'vitest'
import { parseAssistantCommand } from './aiInterpreter'
import type { Customer } from './types'

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
]

describe('assistant command interpreter', () => {
  it('extracts a create-customer draft from the home-decoration scenario', () => {
    const command = parseAssistantCommand(
      '帮我添加一个无锡的客户，预算 50w，是一套 120 平的高层，需求是 3 个人住，有小孩，考虑智能家居',
      customers,
      '2026-05-25T21:00:00.000+08:00',
    )

    expect(command.kind).toBe('create-customer')
    expect(command.requiresConfirmation).toBe(true)
    expect(command.payload).toMatchObject({
      city: '无锡',
      budgetWan: 50,
      areaSqm: 120,
      propertyType: '高层',
      household: '3 个人住，有小孩',
      needs: ['智能家居'],
    })
  })

  it('extracts city, source channel, style preference and budget into a create-customer draft', () => {
    const command = parseAssistantCommand(
      '新增一个苏州客户，来源小红书，预算 80w，喜欢现代简约风格，考虑全屋定制',
      customers,
      '2026-05-25T21:00:00.000+08:00',
    )

    expect(command.kind).toBe('create-customer')
    expect(command.payload).toMatchObject({
      city: '苏州',
      sourceChannel: '小红书',
      stylePreference: '现代简约',
      budgetWan: 80,
      needs: ['全屋定制'],
    })
  })

  it('extracts a city-level region, name and richer customer structure into a create-customer draft', () => {
    const command = parseAssistantCommand(
      '新增北京朝阳的张总客户，预算 50 万，120 平米大平层，三口之家，有小孩，来源朋友介绍，喜欢轻奢风，考虑中央空调和全屋定制',
      customers,
      '2026-05-25T21:00:00.000+08:00',
    )

    expect(command.kind).toBe('create-customer')
    expect(command.payload).toMatchObject({
      name: '张总',
      city: '北京',
      budgetWan: 50,
      areaSqm: 120,
      propertyType: '大平层',
      household: '三口之家，有小孩',
      sourceChannel: '朋友介绍',
      stylePreference: '轻奢',
      needs: ['全屋定制', '中央空调'],
    })
  })

  it('extracts a service-work customer record with first communication fields', () => {
    const command = parseAssistantCommand(
      '记录客户信息 客户微信名 张三 需求内容为 全屋定制 工地位于 武汉 城市 需求日期 6月30号 今天第一次沟通 沟通内容 客户拜托我们先出平面图 是否希望加急 是 是否有服务价值 有',
      customers,
      '2026-05-25T21:00:00.000+08:00',
    )

    expect(command.kind).toBe('create-customer')
    expect(command.payload).toMatchObject({
      name: '张三',
      wechatName: '张三',
      city: '武汉',
      demandDate: '6月30号',
      firstInteractionAt: '2026-05-25T21:00:00.000+08:00',
      firstInteractionSummary: '客户拜托我们先出平面图',
      nextAction: '客户拜托我们先出平面图',
      urgent: true,
      serviceValue: '有',
      needs: ['全屋定制'],
    })
  })

  it('extracts a communication record draft for an existing customer', () => {
    const command = parseAssistantCommand(
      '张总客户 今天沟通一次 沟通内容 客户要求我们给个图纸',
      customers,
      '2026-05-25T21:00:00.000+08:00',
    )

    expect(command.kind).toBe('create-interaction')
    expect(command.requiresConfirmation).toBe(true)
    expect(command.payload).toMatchObject({
      customerId: 'c-zhang',
      customerName: '张总',
      channel: 'wechat',
      summary: '客户要求我们给个图纸',
      nextAction: '客户要求我们给个图纸',
      happenedAt: '2026-05-25T21:00:00.000+08:00',
    })
  })

  it('turns a Wuxi customer question into a local search intent', () => {
    const command = parseAssistantCommand('我在无锡有哪些客户', customers, '2026-05-25T21:00:00.000+08:00')

    expect(command.kind).toBe('query-customers')
    expect(command.requiresConfirmation).toBe(false)
    expect(command.payload).toMatchObject({
      city: '无锡',
      resultSummary: expect.stringContaining('张总'),
    })
  })

  it('extracts an update-customer draft for adding a need', () => {
    const command = parseAssistantCommand(
      '无锡的张总需要加一个整体浴室的需求',
      customers,
      '2026-05-25T21:00:00.000+08:00',
    )

    expect(command.kind).toBe('update-customer')
    expect(command.requiresConfirmation).toBe(true)
    expect(command.payload).toMatchObject({
      customerId: 'c-zhang',
      customerName: '张总',
      need: '整体浴室',
    })
  })

  it('extracts structured fields from a customer update command', () => {
    const command = parseAssistantCommand(
      '无锡的张总预算调整为60万，家里有4口人，养了一只猫',
      customers,
      '2026-05-25T21:00:00.000+08:00',
    )

    expect(command.kind).toBe('update-customer')
    expect(command.requiresConfirmation).toBe(true)
    expect(command.payload).toMatchObject({
      customerId: 'c-zhang',
      customerName: '张总',
      city: '无锡',
      budgetWan: 60,
      household: '4 人住',
      need: '家里有宠物',
    })
  })

  it('extracts a reminder draft tied to Android app and calendar reminder creation', () => {
    const command = parseAssistantCommand(
      '和无锡的张总明天晚上八点有个会，提醒我',
      customers,
      '2026-05-25T21:00:00.000+08:00',
    )

    expect(command.kind).toBe('create-reminder')
    expect(command.requiresConfirmation).toBe(true)
    expect(command.payload).toMatchObject({
      customerId: 'c-zhang',
      title: '和张总开会',
      scheduledAt: '2026-05-26T20:00:00.000+08:00',
      channel: 'app-and-calendar',
    })
  })
})
