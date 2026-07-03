import { extractCustomerDraftFromText, type AssistantBatchAction, type AssistantCommand } from './aiInterpreter'
import { findBestCustomerMatch, createReminderDraft } from './customerLogic'
import { runLocalAgent } from './localAgent'
import type { Customer, CustomerDraft, CustomerUpdateDraft, Interaction, Todo } from './types'

export type AgentMemory = {
  pendingCustomerDraft?: CustomerDraft
  pendingUpdateDraft?: UpdateDraft
  pendingReminderDraft?: ReminderConversationDraft
}

export type LocalAgentTurn = {
  command: AssistantCommand
  memory: AgentMemory | null
}

type CustomerDraftField = keyof CustomerDraft

type UpdateDraft = {
  city?: string
  customerName?: string
  need?: string
} & Partial<Pick<CustomerUpdateDraft, 'needs' | 'budgetWan' | 'areaSqm' | 'propertyType' | 'household' | 'stage' | 'sourceChannel' | 'stylePreference' | 'notes'>>

type ReminderConversationDraft = {
  city?: string
  customerName?: string
  title?: string
  naturalTime?: string
}

const REQUIRED_CUSTOMER_FIELDS: Array<{ key: CustomerDraftField; label: string }> = [
  { key: 'city', label: '城市' },
  { key: 'budgetWan', label: '预算' },
  { key: 'areaSqm', label: '面积' },
  { key: 'propertyType', label: '房屋类型' },
  { key: 'household', label: '家庭结构' },
  { key: 'needs', label: '需求标签' },
]

export function runLocalAgentTurn(
  input: string,
  context: { customers: Customer[]; todos: Todo[]; now: string; interactions?: Interaction[]; memory?: AgentMemory | null },
): LocalAgentTurn {
  const text = input.trim()

  if (isCancelText(text) && context.memory) {
    return {
      command: agentAnswer('已取消当前多轮任务。你可以重新告诉我要新增、查询、修改或提醒的内容。', ['本地对话', '任务清除'], '本地 Agent'),
      memory: null,
    }
  }

  if (context.memory?.pendingUpdateDraft) {
    return updateDraftTurn(mergeUpdateDraft(context.memory.pendingUpdateDraft, extractUpdateDraft(text)), context.customers)
  }

  if (context.memory?.pendingReminderDraft) {
    return reminderDraftTurn(
      mergeReminderDraft(context.memory.pendingReminderDraft, extractReminderDraft(text, context.customers)),
      context.customers,
      context.now,
    )
  }

  if (context.memory?.pendingCustomerDraft) {
    const nextDraft = sanitizeCustomerDraft(extractCustomerDraftFromText(`新增客户 ${text}`))
    const mergedDraft = mergeCustomerDraft(context.memory.pendingCustomerDraft, nextDraft)

    if (hasAnyCustomerDraftValue(nextDraft) || hasAnyCustomerDraftValue(mergedDraft)) {
      return customerDraftTurn(mergedDraft)
    }
  }

  const batchTurn = batchActionTurn(text, context.customers, context.now)
  if (batchTurn) return batchTurn

  const updateDraft = extractUpdateDraft(text)
  if (isUpdateIntent(text) && (updateDraft.city || updateDraft.customerName || hasUpdateDraftChange(updateDraft))) {
    return updateDraftTurn(updateDraft, context.customers)
  }

  const reminderDraft = extractReminderDraft(text, context.customers)
  if (isReminderIntent(text)) {
    return reminderDraftTurn(reminderDraft, context.customers, context.now)
  }

  const command = runLocalAgent(input, {
    customers: context.customers,
    todos: context.todos,
    now: context.now,
    interactions: context.interactions,
  })

  if (command.kind === 'create-customer') {
    const draft = sanitizeCustomerDraft(command.payload)
    if (isServiceCustomerRecordDraft(draft)) {
      return {
        command: {
          kind: 'create-customer',
          requiresConfirmation: true,
          title: '新增客户草稿',
          payload: draft,
        },
        memory: null,
      }
    }

    return customerDraftTurn(draft)
  }

  return { command, memory: null }
}

function customerDraftTurn(draft: CustomerDraft): LocalAgentTurn {
  const missingFields = missingCustomerDraftFields(draft)

  if (missingFields.length === 0) {
    return {
      command: {
        kind: 'create-customer',
        requiresConfirmation: true,
        title: '新增客户草稿',
        payload: draft,
      },
      memory: null,
    }
  }

  return {
    command: agentAnswer(buildCustomerDraftPrompt(draft, missingFields), ['本地结构化提取', '客户字段补全'], '继续补充客户资料'),
    memory: { pendingCustomerDraft: draft },
  }
}

function batchActionTurn(text: string, customers: Customer[], now: string): LocalAgentTurn | null {
  const mentions = customers
    .flatMap((customer) => {
      const index = text.indexOf(customer.name)
      return index >= 0 ? [{ customer, index }] : []
    })
    .sort((left, right) => left.index - right.index)

  if (mentions.length < 2) return null

  const actions: AssistantBatchAction[] = []
  for (let index = 0; index < mentions.length; index += 1) {
    const current = mentions[index]
    const next = mentions[index + 1]
    const segment = text.slice(current.index, next?.index).trim()
    const segmentText = segment.includes(current.customer.name) ? segment : `${current.customer.name}${segment}`

    if (isReminderIntent(segmentText)) {
      const turn = reminderDraftTurn(extractReminderDraft(segmentText, customers), customers, now)
      if (turn.command.kind === 'create-reminder') actions.push(turn.command)
      continue
    }

    if (isUpdateIntent(segmentText)) {
      const turn = updateDraftTurn(extractUpdateDraft(segmentText), customers)
      if (turn.command.kind === 'update-customer') actions.push(turn.command)
      continue
    }

    if (isInteractionText(segmentText)) {
      const target = findBestCustomerMatch(customers, extractCity(segmentText), extractNameHint(segmentText))
      if (!target) continue
      actions.push({
        kind: 'create-interaction',
        requiresConfirmation: true,
        title: '沟通记录草稿',
        payload: {
          customerId: target.id,
          customerName: target.name,
          channel: 'wechat',
          summary: extractCommunicationSummary(segmentText),
          happenedAt: segmentText.includes('今天') ? now : now,
          nextAction: extractNextAction(extractCommunicationSummary(segmentText)),
        },
      })
    }
  }

  if (actions.length < 2) return null

  return {
    command: {
      kind: 'batch-actions',
      requiresConfirmation: true,
      title: '批量动作草稿',
      payload: { actions },
    },
    memory: null,
  }
}

function updateDraftTurn(draft: UpdateDraft, customers: Customer[]): LocalAgentTurn {
  const cityMatches = draft.city ? customers.filter((customer) => customer.city.includes(draft.city ?? '')) : []
  const target =
    draft.customerName || cityMatches.length <= 1
      ? findBestCustomerMatch(customers, draft.city, draft.customerName)
      : null
  const missingFields = [
    target ? '' : '客户姓名',
    hasUpdateDraftChange(draft) ? '' : '要修改的内容',
  ].filter(Boolean)

  if (missingFields.length === 0 && target) {
    return {
      command: {
        kind: 'update-customer',
        requiresConfirmation: true,
        title: '客户需求更新草稿',
        payload: {
          customerId: target.id,
          customerName: target.name,
          city: draft.city || target.city,
          ...(draft.need ? { need: draft.need } : {}),
          ...(draft.needs?.length ? { needs: draft.needs } : {}),
          ...(draft.budgetWan !== undefined ? { budgetWan: draft.budgetWan } : {}),
          ...(draft.areaSqm !== undefined ? { areaSqm: draft.areaSqm } : {}),
          ...(draft.propertyType ? { propertyType: draft.propertyType } : {}),
          ...(draft.household ? { household: draft.household } : {}),
          ...(draft.stage ? { stage: draft.stage } : {}),
          ...(draft.sourceChannel ? { sourceChannel: draft.sourceChannel } : {}),
          ...(draft.stylePreference ? { stylePreference: draft.stylePreference } : {}),
          ...(draft.notes ? { notes: draft.notes } : {}),
        },
      },
      memory: null,
    }
  }

  const names = cityMatches.length ? `可选客户：${cityMatches.map((customer) => customer.name).join('、')}。` : ''
  const recorded = updateDraftSummary(draft)
  const recordedText = recorded.length ? `我已记录：${recorded.join('、')}。` : ''

  return {
    command: agentAnswer(
      `${recordedText}${names}还需要补充：${missingFields.join('、')}。你可以继续直接说客户姓名或需求。`,
      ['本地客户匹配', '客户修改补全'],
      '继续补充客户修改',
    ),
    memory: { pendingUpdateDraft: draft },
  }
}

function reminderDraftTurn(draft: ReminderConversationDraft, customers: Customer[], now: string): LocalAgentTurn {
  const target = findBestCustomerMatch(customers, draft.city, draft.customerName)
  const missingFields = [
    target ? '' : '客户姓名',
    hasReminderTime(draft.naturalTime ?? '') ? '' : '提醒时间',
  ].filter(Boolean)

  if (missingFields.length === 0 && target && draft.title && draft.naturalTime) {
    return {
      command: {
        kind: 'create-reminder',
        requiresConfirmation: true,
        title: '提醒草稿',
        payload: createReminderDraft({
          customers,
          city: draft.city,
          nameHint: target.name,
          title: draft.title,
          naturalTime: draft.naturalTime,
          now,
        }),
      },
      memory: null,
    }
  }

  const recorded = reminderDraftSummary(draft)
  const recordedText = recorded.length ? `我已记录：${recorded.join('、')}。` : ''

  return {
    command: agentAnswer(
      `${recordedText}还需要补充：${missingFields.join('、')}。你可以继续说“明天晚上八点”这类时间，或补充客户姓名。`,
      ['本地客户匹配', '提醒字段补全'],
      '继续补充提醒',
    ),
    memory: { pendingReminderDraft: draft },
  }
}

function buildCustomerDraftPrompt(draft: CustomerDraft, missingFields: string[]): string {
  const summary = customerDraftSummary(draft)
  const summaryText = summary.length ? `我已记录：${summary.join('、')}。` : ''
  return `${summaryText}还需要补充：${missingFields.join('、')}。你可以继续直接说这些信息，我会合并到当前客户草稿里。`
}

function customerDraftSummary(draft: CustomerDraft): string[] {
  return [
    draft.name ? `姓名${draft.name}` : '',
    draft.city ? `城市${draft.city}` : '',
    draft.budgetWan ? `预算${draft.budgetWan}w` : '',
    draft.areaSqm ? `面积${draft.areaSqm}平` : '',
    draft.propertyType ? `房屋类型${draft.propertyType}` : '',
    draft.household ? `家庭结构${draft.household}` : '',
    draft.sourceChannel ? `来源${draft.sourceChannel}` : '',
    draft.stylePreference ? `风格${draft.stylePreference}` : '',
    draft.needs?.length ? `需求${draft.needs.join('、')}` : '',
  ].filter(Boolean)
}

function missingCustomerDraftFields(draft: CustomerDraft): string[] {
  return REQUIRED_CUSTOMER_FIELDS.filter((field) => !hasCustomerDraftField(draft, field.key)).map((field) => field.label)
}

function mergeCustomerDraft(current: CustomerDraft, next: CustomerDraft): CustomerDraft {
  return sanitizeCustomerDraft({
    ...current,
    ...nonEmptyCustomerDraftFields(next),
    needs: unique([...(current.needs ?? []), ...(next.needs ?? [])]),
  })
}

function sanitizeCustomerDraft(draft: CustomerDraft): CustomerDraft {
  return nonEmptyCustomerDraftFields(draft)
}

function nonEmptyCustomerDraftFields(draft: CustomerDraft): CustomerDraft {
  const next: CustomerDraft = {}

  if (draft.name?.trim()) next.name = draft.name.trim()
  if (draft.wechatName?.trim()) next.wechatName = draft.wechatName.trim()
  if (draft.city?.trim()) next.city = draft.city.trim()
  if (draft.budgetWan !== undefined) next.budgetWan = draft.budgetWan
  if (draft.areaSqm !== undefined) next.areaSqm = draft.areaSqm
  if (draft.propertyType?.trim()) next.propertyType = draft.propertyType.trim()
  if (draft.household?.trim()) next.household = draft.household.trim()
  if (draft.stage) next.stage = draft.stage
  if (draft.sourceChannel?.trim()) next.sourceChannel = draft.sourceChannel.trim()
  if (draft.stylePreference?.trim()) next.stylePreference = draft.stylePreference.trim()
  if (draft.needs?.length) next.needs = unique(draft.needs.filter((need) => need.trim()).map((need) => need.trim()))
  if (draft.notes?.trim()) next.notes = draft.notes.trim()
  if (draft.demandDate?.trim()) next.demandDate = draft.demandDate.trim()
  if (draft.urgent !== undefined) next.urgent = draft.urgent
  if (draft.serviceValue?.trim()) next.serviceValue = draft.serviceValue.trim()
  if (draft.firstInteractionAt?.trim()) next.firstInteractionAt = draft.firstInteractionAt.trim()
  if (draft.firstInteractionSummary?.trim()) next.firstInteractionSummary = draft.firstInteractionSummary.trim()
  if (draft.nextAction?.trim()) next.nextAction = draft.nextAction.trim()

  return next
}

function hasAnyCustomerDraftValue(draft: CustomerDraft): boolean {
  return Object.keys(nonEmptyCustomerDraftFields(draft)).length > 0
}

function hasCustomerDraftField(draft: CustomerDraft, key: CustomerDraftField): boolean {
  const value = draft[key]
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return value !== undefined && value !== null
}

function isServiceCustomerRecordDraft(draft: CustomerDraft): boolean {
  return Boolean(draft.wechatName && draft.city && draft.firstInteractionSummary)
}

function extractUpdateDraft(text: string): UpdateDraft {
  const draft = sanitizeCustomerDraft(extractCustomerDraftFromText(`新增客户 ${text}`))
  const need = extractNeed(text) || draft.needs?.[0] || ''

  return {
    city: extractCity(text),
    customerName: extractNameHint(text),
    need,
    ...(draft.needs?.length ? { needs: draft.needs } : {}),
    ...(draft.budgetWan !== undefined ? { budgetWan: draft.budgetWan } : {}),
    ...(draft.areaSqm !== undefined ? { areaSqm: draft.areaSqm } : {}),
    ...(draft.propertyType ? { propertyType: draft.propertyType } : {}),
    ...(draft.household ? { household: draft.household } : {}),
    ...(draft.stage ? { stage: draft.stage } : {}),
    ...(draft.sourceChannel ? { sourceChannel: draft.sourceChannel } : {}),
    ...(draft.stylePreference ? { stylePreference: draft.stylePreference } : {}),
    ...(draft.notes ? { notes: draft.notes } : {}),
  }
}

function mergeUpdateDraft(current: UpdateDraft, next: UpdateDraft): UpdateDraft {
  return {
    city: next.city || current.city,
    customerName: next.customerName || current.customerName,
    need: next.need || current.need,
    needs: unique([...(current.needs ?? []), ...(next.needs ?? [])]),
    budgetWan: next.budgetWan ?? current.budgetWan,
    areaSqm: next.areaSqm ?? current.areaSqm,
    propertyType: next.propertyType || current.propertyType,
    household: next.household || current.household,
    stage: next.stage || current.stage,
    sourceChannel: next.sourceChannel || current.sourceChannel,
    stylePreference: next.stylePreference || current.stylePreference,
    notes: next.notes || current.notes,
  }
}

function updateDraftSummary(draft: UpdateDraft): string[] {
  return [
    draft.city ? `城市${draft.city}` : '',
    draft.customerName ? `客户${draft.customerName}` : '',
    draft.need ? `需求${draft.need}` : '',
    draft.budgetWan !== undefined ? `预算${draft.budgetWan}w` : '',
    draft.areaSqm !== undefined ? `面积${draft.areaSqm}平` : '',
    draft.propertyType ? `房屋类型${draft.propertyType}` : '',
    draft.household ? `家庭结构${draft.household}` : '',
    draft.sourceChannel ? `来源${draft.sourceChannel}` : '',
    draft.stylePreference ? `风格${draft.stylePreference}` : '',
  ].filter(Boolean)
}

function hasUpdateDraftChange(draft: UpdateDraft): boolean {
  return Boolean(
    draft.need ||
      draft.needs?.length ||
      draft.budgetWan !== undefined ||
      draft.areaSqm !== undefined ||
      draft.propertyType ||
      draft.household ||
      draft.stage ||
      draft.sourceChannel ||
      draft.stylePreference ||
      draft.notes,
  )
}

function extractReminderDraft(text: string, customers: Customer[]): ReminderConversationDraft {
  const city = extractCity(text)
  const customerName = extractNameHint(text)
  const target = findBestCustomerMatch(customers, city, customerName)
  return {
    city,
    customerName: target?.name ?? customerName,
    title: reminderTitle(text, target?.name ?? customerName),
    naturalTime: hasReminderTime(text) ? text : undefined,
  }
}

function reminderTitle(text: string, customerName: string): string {
  const name = customerName || '客户'
  if (text.includes('图纸')) return `给${name}发图纸`
  if (text.includes('工地')) return `和${name}去工地`
  if (text.includes('开会') || text.includes('会')) return `和${name}开会`
  return `${name}提醒`
}

function mergeReminderDraft(current: ReminderConversationDraft, next: ReminderConversationDraft): ReminderConversationDraft {
  return {
    city: next.city || current.city,
    customerName: next.customerName || current.customerName,
    title: current.title || next.title,
    naturalTime: next.naturalTime || current.naturalTime,
  }
}

function reminderDraftSummary(draft: ReminderConversationDraft): string[] {
  return [
    draft.city ? `城市${draft.city}` : '',
    draft.customerName ? `客户${draft.customerName}` : '',
    draft.title ? `事项${draft.title}` : '',
    draft.naturalTime ? `时间${draft.naturalTime}` : '',
  ].filter(Boolean)
}

function isUpdateIntent(text: string): boolean {
  if ((text.includes('新增') || text.includes('添加')) && text.includes('客户') && !text.includes('添加需求')) {
    return false
  }

  return (
    text.includes('需要加') ||
    text.includes('增加') ||
    text.includes('添加需求') ||
    text.includes('预算调整') ||
    text.includes('预算改') ||
    text.includes('家里有') ||
    text.includes('家庭结构') ||
    text.includes('养了') ||
    text.includes('养猫') ||
    text.includes('宠物') ||
    text.includes('来源') ||
    text.includes('风格') ||
    /加一个[\u4e00-\u9fa5A-Za-z0-9]+的需求/.test(text)
  )
}

function isReminderIntent(text: string): boolean {
  return text.includes('提醒我') || text.includes('提醒')
}

function isInteractionText(text: string): boolean {
  return text.includes('客户') && text.includes('沟通') && text.includes('沟通内容')
}

function extractCity(text: string): string {
  return ['无锡', '苏州', '上海', '南京', '常州', '杭州', '北京', '天津', '广州', '深圳', '成都', '重庆', '武汉', '黄石', '十堰', '宜昌', '襄阳', '鄂州', '荆门', '孝感', '荆州', '黄冈', '咸宁', '随州', '恩施'].find((city) => text.includes(city)) ?? ''
}

function extractNameHint(text: string): string {
  const explicit = text.match(/的([\u4e00-\u9fa5A-Za-z]{1,8}(?:总|女士|先生|老师|经理))/)?.[1]
  if (explicit) return explicit
  return text.match(/([\u4e00-\u9fa5A-Za-z]{1,8}(?:总|女士|先生|老师|经理))/)?.[1] ?? ''
}

function extractNeed(text: string): string {
  if (text.includes('宠物') || text.includes('养猫') || text.includes('养了一只猫') || text.includes('养了只猫')) {
    return '家里有宠物'
  }

  return (
    text.match(/加一个([\u4e00-\u9fa5A-Za-z0-9]+)的需求/)?.[1] ??
    text.match(/增加([\u4e00-\u9fa5A-Za-z0-9]+)需求/)?.[1] ??
    text.match(/添加([\u4e00-\u9fa5A-Za-z0-9]+)需求/)?.[1] ??
    ''
  )
}

function extractCommunicationSummary(text: string): string {
  return text.match(/沟通内容(?:为|是)?\s*(.*?)(?=\s*是否|[，。]|$)/)?.[1]?.trim() ?? ''
}

function extractNextAction(summary: string): string {
  if (!summary) return ''
  return /拜托|要求|需要|请|给|去|图纸|工地/.test(summary) ? summary : ''
}

function hasReminderTime(text: string): boolean {
  return (
    text.includes('明天') ||
    text.includes('今天') ||
    text.includes('后天') ||
    /\d{1,2}\s*月\s*\d{1,2}\s*(?:号|日)?/.test(text) ||
    /(?:上午|下午|晚上|晚)?\s*\d{1,2}\s*点/.test(text)
  )
}

function agentAnswer(message: string, toolTrace: string[], title: string): AssistantCommand {
  return {
    kind: 'agent-answer',
    requiresConfirmation: false,
    title,
    payload: {
      message,
      toolTrace,
    },
  }
}

function isCancelText(text: string): boolean {
  return ['取消', '算了', '先不加了', '不新增了'].includes(text.replace(/[，。！？!?\s]/g, ''))
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
