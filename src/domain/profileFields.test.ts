import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROFILE_FIELD_DEFINITIONS,
  PROFILE_FIELD_TEMPLATES,
  applyProfileFieldTemplate,
  formatProfileFieldValue,
  getCustomerProfileFieldValue,
  mergeCustomerProfileValues,
  normalizeProfileFieldDefinitions,
} from './profileFields'
import type { Customer, ProfileFieldDefinition } from './types'

const customer: Customer = {
  id: 'cust-1',
  name: '张总',
  city: '无锡',
  budgetWan: 50,
  areaSqm: 120,
  propertyType: '高层',
  household: '三口之家',
  stage: '方案',
  sourceChannel: '小红书',
  stylePreference: '现代',
  needs: ['智能家居'],
  notes: '',
  nextFollowUpAt: '2026-07-05T20:00:00.000+08:00',
  lastInteractionAt: null,
  createdAt: '2026-07-04T10:00:00.000+08:00',
  updatedAt: '2026-07-04T10:00:00.000+08:00',
  syncStatus: 'local',
  profileValues: {
    decisionMaker: {
      value: '张总本人',
      sourceText: '客户说自己拍板',
      updatedAt: '2026-07-04T11:00:00.000+08:00',
    },
  },
}

describe('profile fields', () => {
  it('keeps default summary fields in a stable order', () => {
    expect(DEFAULT_PROFILE_FIELD_DEFINITIONS.map((field) => field.key)).toEqual([
      'budgetWan',
      'household',
      'sourceChannel',
      'stylePreference',
      'nextFollowUpAt',
    ])
  })

  it('reads fixed customer fields and dynamic profile values through one API', () => {
    const customField: ProfileFieldDefinition = {
      id: 'profile-field-decision-maker',
      key: 'decisionMaker',
      label: '决策人',
      description: '最终拍板人',
      type: 'text',
      enabled: true,
      showInSummary: true,
      extractionHint: '提取客户提到的最终决策人',
      order: 20,
    }

    expect(getCustomerProfileFieldValue(customer, DEFAULT_PROFILE_FIELD_DEFINITIONS[0])).toBe(50)
    expect(getCustomerProfileFieldValue(customer, DEFAULT_PROFILE_FIELD_DEFINITIONS[1])).toBe('三口之家')
    expect(getCustomerProfileFieldValue(customer, customField)).toBe('张总本人')
    expect(formatProfileFieldValue(null, customField)).toBe('待补充')
  })

  it('normalizes user-defined fields and filters invalid duplicate keys', () => {
    const normalized = normalizeProfileFieldDefinitions([
      ...DEFAULT_PROFILE_FIELD_DEFINITIONS,
      {
        id: 'custom-1',
        key: 'decisionMaker',
        label: '决策人',
        description: '',
        type: 'text',
        enabled: true,
        showInSummary: true,
        extractionHint: '提取最终拍板人',
        order: 8,
      },
      {
        id: 'custom-2',
        key: 'decisionMaker',
        label: '重复',
        description: '',
        type: 'text',
        enabled: true,
        showInSummary: true,
        extractionHint: '',
        order: 9,
      },
    ])

    expect(normalized.filter((field) => field.key === 'decisionMaker')).toHaveLength(1)
    expect(normalized.find((field) => field.key === 'decisionMaker')?.label).toBe('决策人')
  })

  it('ships templates with valid unique fields', () => {
    const generalSalesTemplate = PROFILE_FIELD_TEMPLATES.find((template) => template.id === 'profile-template-general-sales')

    expect(generalSalesTemplate?.fields.map((field) => field.key)).toEqual([
      'budgetWan',
      'decisionMaker',
      'demandFocus',
      'sourceChannel',
      'nextFollowUpAt',
    ])

    for (const template of PROFILE_FIELD_TEMPLATES) {
      expect(normalizeProfileFieldDefinitions(template.fields)).toHaveLength(template.fields.length)
    }
  })

  it('applies a template as a view while keeping previous fields hidden in the field library', () => {
    const generalSalesTemplate = PROFILE_FIELD_TEMPLATES.find((template) => template.id === 'profile-template-general-sales')
    if (!generalSalesTemplate) throw new Error('missing general sales template')

    const merged = applyProfileFieldTemplate(DEFAULT_PROFILE_FIELD_DEFINITIONS, generalSalesTemplate.fields)

    expect(merged.map((field) => field.key)).toEqual([
      'budgetWan',
      'decisionMaker',
      'demandFocus',
      'sourceChannel',
      'nextFollowUpAt',
      'household',
      'stylePreference',
    ])
    expect(merged.find((field) => field.key === 'household')).toMatchObject({
      enabled: false,
      showInSummary: false,
    })
    expect(merged.find((field) => field.key === 'stylePreference')).toMatchObject({
      enabled: false,
      showInSummary: false,
    })
  })

  it('merges extracted values without writing empty values', () => {
    const merged = mergeCustomerProfileValues(
      customer,
      {
        decisionMaker: '李总',
        purchaseCycle: '本月内',
        emptyValue: '',
      },
      '客户说李总拍板，本月内确定',
      '2026-07-04T12:00:00.000+08:00',
    )

    expect(merged.profileValues?.decisionMaker.value).toBe('李总')
    expect(merged.profileValues?.decisionMaker.sourceText).toBe('客户说李总拍板，本月内确定')
    expect(merged.profileValues?.purchaseCycle.value).toBe('本月内')
    expect(merged.profileValues?.emptyValue).toBeUndefined()
  })
})
