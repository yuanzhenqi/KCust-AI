import type { Customer, CustomerUpdateDraft } from './types'

export function normalizeCustomerUpdateDraft(draft: CustomerUpdateDraft): CustomerUpdateDraft {
  const parsed = parseProfileFacts([draft.need, ...(draft.needs ?? [])])
  const nextNeeds = normalizeNeedTexts(draft.need, draft.needs)

  return {
    ...draft,
    ...(draft.budgetWan === undefined && parsed.budgetWan !== undefined ? { budgetWan: parsed.budgetWan } : {}),
    ...(draft.areaSqm === undefined && parsed.areaSqm !== undefined ? { areaSqm: parsed.areaSqm } : {}),
    ...(draft.propertyType?.trim() ? {} : parsed.propertyType ? { propertyType: parsed.propertyType } : {}),
    ...(draft.household?.trim() ? {} : parsed.household ? { household: parsed.household } : {}),
    ...(draft.sourceChannel?.trim() ? {} : parsed.sourceChannel ? { sourceChannel: parsed.sourceChannel } : {}),
    ...(draft.stylePreference?.trim() ? {} : parsed.stylePreference ? { stylePreference: parsed.stylePreference } : {}),
    ...(nextNeeds.length ? { needs: nextNeeds } : {}),
    ...(!nextNeeds.length ? { need: undefined } : {}),
    ...(nextNeeds.length === 1 ? { need: nextNeeds[0] } : {}),
  }
}

export function normalizeCustomerProfileFromNeeds(customer: Customer): Customer {
  const parsed = parseProfileFacts(customer.needs)
  const needs = normalizeNeedTexts(undefined, customer.needs)

  return {
    ...customer,
    ...(customer.budgetWan === null && parsed.budgetWan !== undefined ? { budgetWan: parsed.budgetWan } : {}),
    ...(customer.areaSqm === null && parsed.areaSqm !== undefined ? { areaSqm: parsed.areaSqm } : {}),
    ...(customer.propertyType.trim() ? {} : parsed.propertyType ? { propertyType: parsed.propertyType } : {}),
    ...(customer.household.trim() ? {} : parsed.household ? { household: parsed.household } : {}),
    ...(customer.sourceChannel?.trim() ? {} : parsed.sourceChannel ? { sourceChannel: parsed.sourceChannel } : {}),
    ...(customer.stylePreference?.trim() ? {} : parsed.stylePreference ? { stylePreference: parsed.stylePreference } : {}),
    needs,
  }
}

function normalizeNeedTexts(need: string | undefined, needs: string[] | undefined): string[] {
  const normalized: string[] = []

  for (const text of [need, ...(needs ?? [])]) {
    if (!text?.trim()) continue
    const extractedNeeds = extractNeedLabels(text)
    if (extractedNeeds.length) {
      normalized.push(...extractedNeeds)
      continue
    }
    if (!isProfileOnlyText(text)) normalized.push(text.trim())
  }

  return unique(normalized)
}

function parseProfileFacts(texts: Array<string | undefined>): Partial<CustomerUpdateDraft> {
  const joined = texts.filter(Boolean).join('；')
  const budgetWan = extractBudgetWan(joined)
  const areaSqm = numberFrom(joined.match(/(\d+(?:\.\d+)?)\s*(?:平|平米|㎡)/)?.[1])
  const propertyType = extractPropertyType(joined)
  const household = extractHousehold(joined)
  const sourceChannel = extractSourceChannel(joined)
  const stylePreference = extractStylePreference(joined)

  return {
    ...(budgetWan !== undefined ? { budgetWan } : {}),
    ...(areaSqm !== undefined ? { areaSqm } : {}),
    ...(propertyType ? { propertyType } : {}),
    ...(household ? { household } : {}),
    ...(sourceChannel ? { sourceChannel } : {}),
    ...(stylePreference ? { stylePreference } : {}),
  }
}

function extractNeedLabels(text: string): string[] {
  const needs: string[] = []
  if (text.includes('智能家居')) needs.push('智能家居')
  if (text.includes('整体浴室')) needs.push('整体浴室')
  if (text.includes('全屋定制')) needs.push('全屋定制')
  if (text.includes('中央空调')) needs.push('中央空调')
  if (text.includes('宠物') || text.includes('养猫') || text.includes('养了一只猫') || text.includes('养了只猫')) {
    needs.push('家里有宠物')
  }
  return unique(needs)
}

function isProfileOnlyText(text: string): boolean {
  return Boolean(
    extractBudgetWan(text) !== undefined ||
      extractHousehold(text) ||
      extractSourceChannel(text) ||
      extractStylePreference(text) ||
      extractPropertyType(text) ||
      numberFrom(text.match(/(\d+(?:\.\d+)?)\s*(?:平|平米|㎡)/)?.[1]) !== undefined,
  )
}

function extractBudgetWan(text: string): number | undefined {
  return numberFrom(text.match(/预算(?:调整为|改为|改到|调整到|是)?\s*(\d+(?:\.\d+)?)\s*(?:w|万)/i)?.[1])
}

function extractHousehold(text: string): string {
  const householdPeople =
    text.match(/(\d+)\s*个?人住/)?.[1] ??
    text.match(/(\d+)\s*口人/)?.[1] ??
    text.match(/家里有\s*(\d+)\s*个?人/)?.[1] ??
    text.match(/家庭结构[:：]?\s*(\d+)\s*人住/)?.[1]
  const householdPhrase = extractHouseholdPhrase(text)
  return [householdPeople ? `${householdPeople} 人住` : householdPhrase, text.includes('小孩') ? '有小孩' : '']
    .filter(Boolean)
    .join('，')
}

function extractHouseholdPhrase(text: string): string {
  if (text.includes('三口之家') || text.includes('一家三口')) return '三口之家'
  if (text.includes('四口之家') || text.includes('一家四口')) return '四口之家'
  if (text.includes('两口之家') || text.includes('二人世界')) return '两口之家'
  if (text.includes('独居')) return '独居'
  if (text.includes('老人')) return '有老人'
  return ''
}

function extractPropertyType(text: string): string {
  return ['大平层', '高层', '别墅', '洋房', '复式', '老房', '新房'].find((propertyType) => text.includes(propertyType)) ?? ''
}

function extractSourceChannel(text: string): string | undefined {
  return ['老客户转介绍', '朋友介绍', '小红书', '抖音', '自然到店'].find((channel) => text.includes(channel))
}

function extractStylePreference(text: string): string | undefined {
  return ['现代简约', '奶油风', '原木风', '侘寂', '轻奢'].find((style) => text.includes(style))
}

function numberFrom(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}
