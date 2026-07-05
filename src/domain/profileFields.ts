import type {
  Customer,
  ProfileFieldDefinition,
  ProfileFieldPrimitiveValue,
  ProfileFieldType,
  ProfileFieldValue,
} from './types'

const FIXED_PROFILE_FIELD_KEYS = ['budgetWan', 'household', 'sourceChannel', 'stylePreference', 'nextFollowUpAt'] as const
type FixedProfileFieldKey = typeof FIXED_PROFILE_FIELD_KEYS[number]

export interface ProfileFieldTemplate {
  id: string
  name: string
  description: string
  fields: ProfileFieldDefinition[]
}

export const DEFAULT_PROFILE_FIELD_DEFINITIONS: ProfileFieldDefinition[] = [
  {
    id: 'profile-field-budgetWan',
    key: 'budgetWan',
    label: '预算',
    description: '客户预算，单位为万元',
    type: 'number',
    enabled: true,
    showInSummary: true,
    extractionHint: '提取客户明确表达的预算金额，统一按万元保存',
    order: 1,
  },
  {
    id: 'profile-field-household',
    key: 'household',
    label: '家庭结构',
    description: '客户家庭成员、同住关系或使用人群',
    type: 'text',
    enabled: true,
    showInSummary: true,
    extractionHint: '提取几口人、是否有小孩、老人、宠物等家庭结构信息',
    order: 2,
  },
  {
    id: 'profile-field-sourceChannel',
    key: 'sourceChannel',
    label: '来源渠道',
    description: '客户来源',
    type: 'text',
    enabled: true,
    showInSummary: true,
    extractionHint: '提取客户来自微信、小红书、转介绍、门店、广告等渠道',
    order: 3,
  },
  {
    id: 'profile-field-stylePreference',
    key: 'stylePreference',
    label: '风格偏好',
    description: '客户偏好的设计、产品或服务风格',
    type: 'text',
    enabled: true,
    showInSummary: true,
    extractionHint: '提取客户表达的风格、审美或偏好',
    order: 4,
  },
  {
    id: 'profile-field-nextFollowUpAt',
    key: 'nextFollowUpAt',
    label: '下次跟进',
    description: '下一次需要跟进客户的时间',
    type: 'date',
    enabled: true,
    showInSummary: true,
    extractionHint: '提取明确的下次跟进时间',
    order: 5,
  },
]

export const PROFILE_FIELD_TEMPLATES: ProfileFieldTemplate[] = [
  {
    id: 'profile-template-general-sales',
    name: '通用销售',
    description: '预算、决策人、核心需求、来源和下次跟进',
    fields: [
      { ...DEFAULT_PROFILE_FIELD_DEFINITIONS[0], order: 1 },
      {
        id: 'profile-field-decisionMaker',
        key: 'decisionMaker',
        label: '决策人',
        description: '最终拍板或主要影响决策的人',
        type: 'text',
        enabled: true,
        showInSummary: true,
        extractionHint: '提取客户提到的最终拍板人、主要决策人或关键影响人',
        order: 2,
      },
      {
        id: 'profile-field-demandFocus',
        key: 'demandFocus',
        label: '核心需求',
        description: '客户最核心的购买、服务或项目诉求',
        type: 'text',
        enabled: true,
        showInSummary: true,
        extractionHint: '提取客户最在意的需求、痛点、项目目标或交付诉求',
        order: 3,
      },
      { ...DEFAULT_PROFILE_FIELD_DEFINITIONS[2], order: 4 },
      { ...DEFAULT_PROFILE_FIELD_DEFINITIONS[4], order: 5 },
    ],
  },
  {
    id: 'profile-template-home-custom',
    name: '家装定制',
    description: '预算、家庭结构、风格、重点空间和跟进节奏',
    fields: [
      { ...DEFAULT_PROFILE_FIELD_DEFINITIONS[0], order: 1 },
      { ...DEFAULT_PROFILE_FIELD_DEFINITIONS[1], order: 2 },
      { ...DEFAULT_PROFILE_FIELD_DEFINITIONS[3], order: 3 },
      {
        id: 'profile-field-keySpace',
        key: 'keySpace',
        label: '重点空间',
        description: '客户重点关注的空间或房间',
        type: 'text',
        enabled: true,
        showInSummary: true,
        extractionHint: '提取客户重点提到的客厅、厨房、卫浴、儿童房、收纳等空间',
        order: 4,
      },
      { ...DEFAULT_PROFILE_FIELD_DEFINITIONS[4], order: 5 },
    ],
  },
  {
    id: 'profile-template-business-followup',
    name: '商务跟进',
    description: '公司、角色、机会阶段、决策人和下一步',
    fields: [
      {
        id: 'profile-field-companyName',
        key: 'companyName',
        label: '公司',
        description: '客户所在公司或组织',
        type: 'text',
        enabled: true,
        showInSummary: true,
        extractionHint: '提取客户所在公司、门店、品牌或组织名称',
        order: 1,
      },
      {
        id: 'profile-field-contactRole',
        key: 'contactRole',
        label: '角色',
        description: '客户在合作中的身份或岗位',
        type: 'text',
        enabled: true,
        showInSummary: true,
        extractionHint: '提取老板、采购、设计师、负责人、商务等角色信息',
        order: 2,
      },
      {
        id: 'profile-field-opportunityStage',
        key: 'opportunityStage',
        label: '机会阶段',
        description: '合作机会所处阶段',
        type: 'text',
        enabled: true,
        showInSummary: true,
        extractionHint: '提取线索、初聊、报价、谈判、成交、搁置等阶段信号',
        order: 3,
      },
      {
        id: 'profile-field-decisionMaker',
        key: 'decisionMaker',
        label: '决策人',
        description: '最终拍板或主要影响决策的人',
        type: 'text',
        enabled: true,
        showInSummary: true,
        extractionHint: '提取客户提到的最终拍板人、主要决策人或关键影响人',
        order: 4,
      },
      { ...DEFAULT_PROFILE_FIELD_DEFINITIONS[4], order: 5 },
    ],
  },
]

export function normalizeProfileFieldDefinitions(fields: ProfileFieldDefinition[]): ProfileFieldDefinition[] {
  const seenKeys = new Set<string>()
  const normalized: ProfileFieldDefinition[] = []

  for (const field of fields) {
    const key = normalizeProfileFieldKey(field.key)
    if (!key || seenKeys.has(key) || !isProfileFieldType(field.type)) continue
    seenKeys.add(key)
    normalized.push({
      id: field.id.trim() || `profile-field-${key}`,
      key,
      label: field.label.trim() || key,
      description: field.description.trim(),
      type: field.type,
      ...(field.options?.length ? { options: uniqueStrings(field.options) } : {}),
      enabled: field.enabled,
      showInSummary: field.showInSummary,
      extractionHint: field.extractionHint.trim(),
      order: Number.isFinite(field.order) ? field.order : normalized.length + 1,
    })
  }

  return normalized.sort((left, right) => left.order - right.order)
}

export function getSummaryProfileFields(fields: ProfileFieldDefinition[]): ProfileFieldDefinition[] {
  return normalizeProfileFieldDefinitions(fields).filter((field) => field.enabled && field.showInSummary)
}

export function applyProfileFieldTemplate(
  currentFields: ProfileFieldDefinition[],
  templateFields: ProfileFieldDefinition[],
): ProfileFieldDefinition[] {
  const current = normalizeProfileFieldDefinitions(currentFields)
  const template = normalizeProfileFieldDefinitions(templateFields)
  const currentByKey = new Map(current.map((field) => [field.key, field]))
  const templateKeys = new Set(template.map((field) => field.key))

  const visibleFields = template.map((field, index) => ({
    ...field,
    id: currentByKey.get(field.key)?.id ?? field.id,
    enabled: true,
    showInSummary: true,
    order: index + 1,
  }))
  const hiddenFields = current
    .filter((field) => !templateKeys.has(field.key))
    .map((field, index) => ({
      ...field,
      enabled: false,
      showInSummary: false,
      order: visibleFields.length + index + 1,
    }))

  return normalizeProfileFieldDefinitions([...visibleFields, ...hiddenFields])
}

export function getCustomerProfileFieldValue(
  customer: Customer,
  field: ProfileFieldDefinition,
): ProfileFieldPrimitiveValue {
  if (isFixedProfileFieldKey(field.key)) return readFixedProfileField(customer, field.key)
  return customer.profileValues?.[field.key]?.value ?? null
}

export function formatProfileFieldValue(
  value: ProfileFieldPrimitiveValue,
  field: ProfileFieldDefinition,
): string {
  if (value === null || value === undefined || value === '') return '待补充'
  if (Array.isArray(value)) return value.length ? value.join('、') : '待补充'
  if (field.key === 'budgetWan' && typeof value === 'number') return `${value}w`
  if (field.type === 'boolean') return value ? '是' : '否'
  return String(value)
}

export function mergeCustomerProfileValues(
  customer: Customer,
  values: Record<string, ProfileFieldPrimitiveValue> | undefined,
  sourceText: string,
  updatedAt: string,
): Customer {
  if (!values) return customer

  const nextValues: Record<string, ProfileFieldValue> = { ...(customer.profileValues ?? {}) }
  for (const [key, rawValue] of Object.entries(values)) {
    const normalizedKey = normalizeProfileFieldKey(key)
    if (!normalizedKey || isEmptyProfileValue(rawValue)) continue
    nextValues[normalizedKey] = {
      value: rawValue,
      ...(sourceText.trim() ? { sourceText: sourceText.trim() } : {}),
      updatedAt,
    }
  }

  return {
    ...customer,
    profileValues: nextValues,
  }
}

export function normalizeProfileFieldKey(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.replace(/[^A-Za-z0-9_]/g, '')
}

function readFixedProfileField(customer: Customer, key: FixedProfileFieldKey): ProfileFieldPrimitiveValue {
  if (key === 'budgetWan') return customer.budgetWan
  if (key === 'household') return customer.household || null
  if (key === 'sourceChannel') return customer.sourceChannel || null
  if (key === 'stylePreference') return customer.stylePreference || null
  return customer.nextFollowUpAt
}

function isFixedProfileFieldKey(value: string): value is FixedProfileFieldKey {
  return FIXED_PROFILE_FIELD_KEYS.includes(value as FixedProfileFieldKey)
}

function isProfileFieldType(value: string): value is ProfileFieldType {
  return ['text', 'number', 'singleSelect', 'multiSelect', 'date', 'boolean'].includes(value)
}

function isEmptyProfileValue(value: ProfileFieldPrimitiveValue): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  return false
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}
