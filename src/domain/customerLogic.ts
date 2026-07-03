import type {
  Customer,
  CustomerCluster,
  CustomerDraft,
  CustomerUpdateDraft,
  HealthScore,
  ReminderDraft,
  Todo,
} from './types'
import { normalizeCustomerUpdateDraft } from './customerUpdateNormalization'

const DEFAULT_NOW = '2026-05-25T21:00:00.000+08:00'

export function createCustomerFromDraft(draft: CustomerDraft, now = DEFAULT_NOW): Customer {
  const displayName = draft.name?.trim() || draft.wechatName?.trim() || '未命名客户'
  const idSeed = `${displayName}-${draft.city ?? 'local'}-${now}`
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()

  return {
    id: `cust-${idSeed || crypto.randomUUID()}`,
    name: displayName,
    city: draft.city?.trim() || '未填写',
    budgetWan: draft.budgetWan ?? null,
    areaSqm: draft.areaSqm ?? null,
    propertyType: draft.propertyType?.trim() || '',
    household: draft.household?.trim() || '',
    stage: draft.stage ?? '线索',
    sourceChannel: draft.sourceChannel?.trim() || '',
    stylePreference: draft.stylePreference?.trim() || '',
    needs: unique(draft.needs ?? []),
    notes: draft.notes?.trim() || '',
    nextFollowUpAt: null,
    lastInteractionAt: null,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local',
  }
}

export function filterCustomersByCity(customers: Customer[], city: string): Customer[] {
  const normalizedCity = normalize(city)
  return customers.filter((customer) => normalize(customer.city).includes(normalizedCity))
}

export function summarizeCustomers(customers: Customer[]): string {
  if (customers.length === 0) return '没有找到匹配客户。'

  return customers
    .map((customer) => {
      const budget = customer.budgetWan ? `${customer.budgetWan}w` : '预算未填写'
      const area = customer.areaSqm ? `${customer.areaSqm}平` : '面积未填写'
      const needs = customer.needs.length ? customer.needs.join('、') : '需求待补充'
      const source = customer.sourceChannel ? `｜${customer.sourceChannel}` : ''
      const style = customer.stylePreference ? `｜${customer.stylePreference}` : ''
      return `${customer.name}｜${customer.city}｜${budget}｜${area}｜${customer.stage}｜${needs}${source}${style}`
    })
    .join('\n')
}

export function addNeedToBestCustomerMatch(
  customers: Customer[],
  input: { city?: string; nameHint?: string; need: string; now: string },
): { customers: Customer[]; updatedCustomer: Customer | null } {
  return applyCustomerUpdateToBestMatch(customers, {
    city: input.city ?? '',
    customerId: null,
    customerName: input.nameHint ?? '',
    need: input.need,
    now: input.now,
  })
}

export function applyCustomerUpdateToBestMatch(
  customers: Customer[],
  input: CustomerUpdateDraft & { now: string },
): { customers: Customer[]; updatedCustomer: Customer | null } {
  const normalizedInput = normalizeCustomerUpdateDraft(input)
  const target = input.customerId
    ? customers.find((customer) => customer.id === input.customerId)
    : findBestCustomerMatch(customers, input.city, input.customerName)

  if (!target) return { customers, updatedCustomer: null }

  const nextNeeds = unique([
    ...target.needs,
    ...(normalizedInput.need ? [normalizedInput.need] : []),
    ...(normalizedInput.needs ?? []),
  ])

  const updatedCustomer: Customer = {
    ...target,
    ...(normalizedInput.budgetWan !== undefined ? { budgetWan: normalizedInput.budgetWan } : {}),
    ...(normalizedInput.areaSqm !== undefined ? { areaSqm: normalizedInput.areaSqm } : {}),
    ...(normalizedInput.propertyType?.trim() ? { propertyType: normalizedInput.propertyType.trim() } : {}),
    ...(normalizedInput.household?.trim() ? { household: normalizedInput.household.trim() } : {}),
    ...(normalizedInput.stage ? { stage: normalizedInput.stage } : {}),
    ...(normalizedInput.sourceChannel?.trim() ? { sourceChannel: normalizedInput.sourceChannel.trim() } : {}),
    ...(normalizedInput.stylePreference?.trim() ? { stylePreference: normalizedInput.stylePreference.trim() } : {}),
    ...(normalizedInput.notes?.trim() ? { notes: normalizedInput.notes.trim() } : {}),
    needs: nextNeeds,
    updatedAt: input.now,
  }

  return {
    customers: customers.map((customer) => (customer.id === target.id ? updatedCustomer : customer)),
    updatedCustomer,
  }
}

export function createReminderDraft(input: {
  customers: Customer[]
  city?: string
  nameHint?: string
  title: string
  naturalTime: string
  now: string
}): ReminderDraft {
  const target = findBestCustomerMatch(input.customers, input.city, input.nameHint)

  return {
    customerId: target?.id ?? null,
    title: input.title,
    scheduledAt: parseNaturalReminderTime(input.naturalTime, input.now),
    channel: 'app-and-calendar',
    status: 'draft',
  }
}

export function scoreCustomerHealth(customer: Customer, todos: Todo[], now: string): HealthScore {
  const reasons: string[] = []
  let score = 100

  if (!customer.household.trim()) {
    score -= 10
    reasons.push('家庭结构未完善')
  }

  if (!customer.budgetWan) {
    score -= 12
    reasons.push('预算未明确')
  }

  if (!customer.needs.length) {
    score -= 10
    reasons.push('需求标签不足')
  }

  if (!customer.nextFollowUpAt) {
    score -= 10
    reasons.push('缺少下次跟进')
  }

  const lastInteractionDays = customer.lastInteractionAt
    ? daysBetween(customer.lastInteractionAt, now)
    : Number.POSITIVE_INFINITY

  if (lastInteractionDays > 30) {
    score -= 25
    reasons.push('超过 30 天未互动')
  }

  const hasOverdueTodo = todos.some(
    (todo) => todo.customerId === customer.id && !todo.completed && todo.dueAt && new Date(todo.dueAt) < new Date(now),
  )

  if (hasOverdueTodo) {
    score -= 20
    reasons.push('存在逾期待办')
  }

  if (customer.stage === '成交') score += 5
  if (customer.stage === '流失') score -= 20

  return {
    customerId: customer.id,
    score: Math.max(0, Math.min(100, score)),
    reasons: reasons.length ? reasons : ['状态健康'],
  }
}

export function buildNextStepSuggestion(customer: Customer, todos: Todo[], now: string): string {
  const overdueTodo = todos
    .filter((todo) => todo.customerId === customer.id && !todo.completed && todo.dueAt && new Date(todo.dueAt) < new Date(now))
    .sort((left, right) => new Date(left.dueAt ?? now).getTime() - new Date(right.dueAt ?? now).getTime())[0]

  if (overdueTodo) return `先处理逾期待办：${overdueTodo.title}，避免跟进节奏断掉。`
  if (!customer.nextFollowUpAt) return '先补一个明确的下次跟进时间，让客户关系进入可提醒状态。'
  if (!customer.budgetWan) return '先确认预算区间，再匹配方案深度和主材配置。'
  if (!customer.needs.length) return '先补齐需求标签，至少明确收纳、设备、风格和重点空间。'

  if (customer.stage === '线索') return '先完成基础信息和预算确认，再安排一次初聊。'
  if (customer.stage === '初聊') return '推进到量房预约，提前准备家庭结构和生活方式问题。'
  if (customer.stage === '量房') return '整理现场尺寸和痛点，准备第一版空间规划。'
  if (customer.stage === '方案') return `推进方案确认，围绕${customer.budgetWan}w预算收敛智能家居和重点空间配置。`
  if (customer.stage === '报价') return '拆解报价差异和可选项，推动客户确认取舍。'
  if (customer.stage === '成交') return '维护交付节点和复购/转介绍机会。'
  if (customer.stage === '搁置') return '用低压力方式同步新案例，判断是否重新激活。'
  return '记录流失原因，沉淀相似客户的风险信号。'
}

export function buildCustomerClusters(customers: Customer[]): CustomerCluster[] {
  const remaining = [...customers]
  const clusters: CustomerCluster[] = []

  while (remaining.length > 0) {
    const seed = remaining.shift()!
    const similar = [seed]

    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      if (isSimilarCustomer(seed, remaining[index])) {
        similar.push(remaining[index])
        remaining.splice(index, 1)
      }
    }

    const topNeed = mostCommon(similar.flatMap((customer) => customer.needs)) ?? '综合需求'
    const topStyle = mostCommon(similar.map((customer) => customer.stylePreference).filter(isNonEmptyString)) ?? ''
    const budgetLabel = average(similar.map((customer) => customer.budgetWan).filter(isNumber))
    const label = `${seed.city || '未知城市'} · ${topStyle || topNeed} · ${Math.round(budgetLabel || 0)}w画像`

    clusters.push({
      id: `cluster-${clusters.length + 1}`,
      label,
      customerIds: similar.map((customer) => customer.id),
      dimensions: unique([
        seed.city,
        seed.propertyType,
        topNeed,
        topStyle,
        seed.household.includes('小孩') ? '有小孩' : '',
      ]).filter(Boolean),
    })
  }

  return clusters.sort((a, b) => b.customerIds.length - a.customerIds.length)
}

export function findBestCustomerMatch(
  customers: Customer[],
  city?: string,
  nameHint?: string,
): Customer | null {
  const scored = customers
    .map((customer) => {
      let score = 0
      if (city && normalize(customer.city).includes(normalize(city))) score += 4
      if (nameHint && normalize(customer.name).includes(normalize(nameHint))) score += 6
      if (!city && !nameHint) score += 1
      return { customer, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored[0]?.customer ?? null
}

function isSimilarCustomer(left: Customer, right: Customer): boolean {
  const sameCity = normalize(left.city) === normalize(right.city)
  const budgetClose =
    isNumber(left.budgetWan) && isNumber(right.budgetWan) ? Math.abs(left.budgetWan - right.budgetWan) <= 15 : false
  const areaClose =
    isNumber(left.areaSqm) && isNumber(right.areaSqm) ? Math.abs(left.areaSqm - right.areaSqm) <= 30 : false
  const sharedNeed = left.needs.some((need) => right.needs.includes(need))
  const sameStyle = Boolean(left.stylePreference) && left.stylePreference === right.stylePreference
  const similarHousehold =
    Boolean(left.household) &&
    Boolean(right.household) &&
    (left.household.includes('小孩') === right.household.includes('小孩') || left.household === right.household)

  return sameCity && [budgetClose, areaClose, sharedNeed, sameStyle, similarHousehold].filter(Boolean).length >= 2
}

function parseNaturalReminderTime(naturalTime: string, now: string): string {
  const datePart = now.slice(0, 10)
  const [year, month, day] = datePart.split('-').map(Number)
  const dayOffset = parseDayOffset(naturalTime)
  const explicitDate = parseExplicitMonthDay(naturalTime, year)
  const base = explicitDate ?? new Date(Date.UTC(year, month - 1, day + dayOffset))
  const hour = parseReminderHour(naturalTime)
  const targetYear = base.getUTCFullYear()
  const targetMonth = String(base.getUTCMonth() + 1).padStart(2, '0')
  const targetDay = String(base.getUTCDate()).padStart(2, '0')

  return `${targetYear}-${targetMonth}-${targetDay}T${String(hour).padStart(2, '0')}:00:00.000+08:00`
}

function parseExplicitMonthDay(naturalTime: string, year: number): Date | null {
  const match = naturalTime.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*(?:号|日)?/)
  if (!match) return null

  const month = Number(match[1])
  const day = Number(match[2])
  if (!Number.isInteger(month) || !Number.isInteger(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  return new Date(Date.UTC(year, month - 1, day))
}

function parseDayOffset(naturalTime: string): number {
  if (naturalTime.includes('后天')) return 2
  if (naturalTime.includes('明天') || naturalTime.includes('明晚')) return 1
  return 0
}

function parseReminderHour(naturalTime: string): number {
  const explicitHour = parseHourNumber(naturalTime)
  const hour = explicitHour ?? 9

  if ((naturalTime.includes('下午') || naturalTime.includes('晚上') || naturalTime.includes('晚')) && hour < 12) {
    return hour + 12
  }

  return hour
}

function parseHourNumber(naturalTime: string): number | null {
  const numeric = naturalTime.match(/(\d{1,2})\s*点/)?.[1]
  if (numeric) return normalizeHour(Number(numeric))

  const chinese = naturalTime.match(/([一二两三四五六七八九十]{1,3})\s*点/)?.[1]
  if (!chinese) return null

  return normalizeHour(chineseHourToNumber(chinese))
}

function chineseHourToNumber(value: string): number {
  const digitMap: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  }

  if (value === '十') return 10
  if (value.startsWith('十')) return 10 + (digitMap[value.slice(1)] ?? 0)
  if (value.endsWith('十')) return (digitMap[value.slice(0, 1)] ?? 1) * 10
  if (value.includes('十')) {
    const [tens, ones] = value.split('十')
    return (digitMap[tens] ?? 1) * 10 + (digitMap[ones] ?? 0)
  }

  return digitMap[value] ?? 9
}

function normalizeHour(value: number): number {
  if (!Number.isFinite(value)) return 9
  if (value < 0) return 9
  if (value > 23) return 9
  return value
}

function daysBetween(start: string, end: string): number {
  const diff = new Date(end).getTime() - new Date(start).getTime()
  return Math.floor(diff / 86_400_000)
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function isNumber(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>()
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1))
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}
