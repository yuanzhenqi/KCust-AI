import { describe, expect, it } from 'vitest'
import { createInteractionRecord, sortInteractionsForTimeline } from './interactionLogic'
import type { Customer, Interaction } from './types'

const customer: Customer = {
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
  createdAt: '2026-05-25T21:00:00.000+08:00',
  updatedAt: '2026-05-25T21:00:00.000+08:00',
  syncStatus: 'local',
}

describe('interaction logic', () => {
  it('creates a communication record and updates customer recency fields', () => {
    const result = createInteractionRecord(customer, {
      channel: 'wechat',
      summary: '确认需要整体浴室和儿童房收纳',
      happenedAt: '2026-05-27T10:30:00.000+08:00',
      nextAction: '发送整体浴室案例',
      now: '2026-05-27T10:35:00.000+08:00',
    })

    expect(result.interaction).toEqual({
      id: 'interaction-c-zhang-2026-05-27T10-30-00-000-08-00',
      customerId: 'c-zhang',
      channel: 'wechat',
      summary: '确认需要整体浴室和儿童房收纳',
      happenedAt: '2026-05-27T10:30:00.000+08:00',
      nextAction: '发送整体浴室案例',
      createdAt: '2026-05-27T10:35:00.000+08:00',
    })
    expect(result.customer).toMatchObject({
      notes: '确认需要整体浴室和儿童房收纳',
      lastInteractionAt: '2026-05-27T10:30:00.000+08:00',
      updatedAt: '2026-05-27T10:35:00.000+08:00',
    })
  })

  it('sorts communication records newest first for the timeline', () => {
    const interactions: Interaction[] = [
      {
        id: 'old',
        customerId: 'c-zhang',
        channel: 'phone',
        summary: '电话确认预算',
        happenedAt: '2026-05-20T09:00:00.000+08:00',
        nextAction: '',
        createdAt: '2026-05-20T09:10:00.000+08:00',
      },
      {
        id: 'new',
        customerId: 'c-zhang',
        channel: 'site-visit',
        summary: '现场量房',
        happenedAt: '2026-05-25T14:00:00.000+08:00',
        nextAction: '整理尺寸',
        createdAt: '2026-05-25T15:00:00.000+08:00',
      },
    ]

    expect(sortInteractionsForTimeline(interactions).map((interaction) => interaction.id)).toEqual(['new', 'old'])
  })
})
