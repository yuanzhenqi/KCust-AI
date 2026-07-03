import {
  createReminderDraft,
  filterCustomersByCity,
  findBestCustomerMatch,
  summarizeCustomers,
} from './customerLogic'
import type { Customer, CustomerDraft, CustomerUpdateDraft, Interaction, ReminderDraft } from './types'

export type AssistantBatchAction =
  | {
      kind: 'update-customer'
      requiresConfirmation: true
      title: string
      payload: CustomerUpdateDraft
    }
  | {
      kind: 'create-interaction'
      requiresConfirmation: true
      title: string
      payload: {
        customerId: string | null
        customerName: string
        channel: Interaction['channel']
        summary: string
        happenedAt: string
        nextAction: string
      }
    }
  | {
      kind: 'create-reminder'
      requiresConfirmation: true
      title: string
      payload: ReminderDraft
    }

export type AssistantCommand =
  | {
      kind: 'create-customer'
      requiresConfirmation: true
      title: string
      payload: CustomerDraft
    }
  | {
      kind: 'query-customers'
      requiresConfirmation: false
      title: string
      payload: { city: string; resultSummary: string }
    }
  | {
      kind: 'agent-answer'
      requiresConfirmation: false
      title: string
      payload: { message: string; toolTrace: string[] }
    }
  | {
      kind: 'update-customer'
      requiresConfirmation: true
      title: string
      payload: CustomerUpdateDraft
    }
  | {
      kind: 'create-interaction'
      requiresConfirmation: true
      title: string
      payload: {
        customerId: string | null
        customerName: string
        channel: Interaction['channel']
        summary: string
        happenedAt: string
        nextAction: string
      }
    }
  | {
      kind: 'create-reminder'
      requiresConfirmation: true
      title: string
      payload: ReminderDraft
    }
  | {
      kind: 'batch-actions'
      requiresConfirmation: true
      title: string
      payload: { actions: AssistantBatchAction[] }
    }
  | {
      kind: 'unknown'
      requiresConfirmation: false
      title: string
      payload: { message: string }
    }

export function parseAssistantCommand(input: string, customers: Customer[], now: string): AssistantCommand {
  const text = input.trim()

  if (isCreateCustomerText(text)) {
    return {
      kind: 'create-customer',
      requiresConfirmation: true,
      title: '新增客户草稿',
      payload: extractCustomerDraftFromText(text, now),
    }
  }

  if (isInteractionText(text)) {
    const city = extractCity(text)
    const nameHint = extractNameHint(text)
    const customer = findBestCustomerMatch(customers, city, nameHint)
    const summary = extractCommunicationSummary(text)

    return {
      kind: 'create-interaction',
      requiresConfirmation: true,
      title: '沟通记录草稿',
      payload: {
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? (nameHint || '未匹配客户'),
        channel: 'wechat',
        summary,
        happenedAt: text.includes('今天') ? now : now,
        nextAction: extractNextAction(summary),
      },
    }
  }

  if (text.includes('哪些客户')) {
    const city = extractCity(text)
    const matches = city ? filterCustomersByCity(customers, city) : customers
    return {
      kind: 'query-customers',
      requiresConfirmation: false,
      title: '本地客户查询结果',
      payload: {
        city: city || '全部',
        resultSummary: summarizeCustomers(matches),
      },
    }
  }

  if (isUpdateCustomerText(text)) {
    const city = extractCity(text)
    const nameHint = extractNameHint(text)
    const customer = findBestCustomerMatch(customers, city, nameHint)

    return {
      kind: 'update-customer',
      requiresConfirmation: true,
      title: '客户需求更新草稿',
      payload: {
        ...extractCustomerUpdateFieldsFromText(text),
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? nameHint ?? '未匹配客户',
        city: city || customer?.city || '',
      },
    }
  }

  if (text.includes('提醒我') || text.includes('提醒')) {
    const city = extractCity(text)
    const nameHint = extractNameHint(text)
    const customer = findBestCustomerMatch(customers, city, nameHint)
    const title = customer ? `和${customer.name}开会` : '客户会议'

    return {
      kind: 'create-reminder',
      requiresConfirmation: true,
      title: '提醒草稿',
      payload: createReminderDraft({
        customers,
        city,
        nameHint,
        title,
        naturalTime: text,
        now,
      }),
    }
  }

  return {
    kind: 'unknown',
    requiresConfirmation: false,
    title: '未识别指令',
    payload: { message: '我可以帮你新增客户、查询客户、更新需求或创建提醒。' },
  }
}

function isCreateCustomerText(text: string): boolean {
  return ((text.includes('添加') || text.includes('新增')) && text.includes('客户')) || text.includes('记录客户信息')
}

function isInteractionText(text: string): boolean {
  return text.includes('客户') && text.includes('沟通') && text.includes('沟通内容')
}

function isUpdateCustomerText(text: string): boolean {
  if ((text.includes('添加') || text.includes('新增')) && text.includes('客户') && !text.includes('添加需求')) {
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
    text.includes('风格')
  )
}

export function extractCustomerDraftFromText(text: string, now?: string): CustomerDraft {
  const wechatName = extractWechatName(text)
  const name = extractNameHint(text) || wechatName
  const city = extractCity(text)
  const budgetWan = extractBudgetWan(text)
  const areaSqm = numberFrom(text.match(/(\d+(?:\.\d+)?)\s*(?:平|平米|㎡)/)?.[1])
  const propertyType = extractPropertyType(text)
  const household = extractHousehold(text).replace(' 人住', ' 个人住')
  const needs = extractNeeds(text)
  const firstInteractionSummary = extractCommunicationSummary(text)
  const demandDate = extractDemandDate(text)
  const urgent = extractUrgent(text)
  const serviceValue = extractServiceValue(text)
  const notes = [
    demandDate ? `需求日期：${demandDate}` : '',
    urgent !== undefined ? `是否加急：${urgent ? '是' : '否'}` : '',
    serviceValue ? `服务价值：${serviceValue}` : '',
    firstInteractionSummary ? `首次沟通：${firstInteractionSummary}` : '',
  ].filter(Boolean).join('；')

  return {
    name,
    wechatName,
    city,
    budgetWan,
    areaSqm,
    propertyType,
    household,
    sourceChannel: extractSourceChannel(text),
    stylePreference: extractStylePreference(text),
    needs,
    notes,
    demandDate,
    urgent,
    serviceValue,
    firstInteractionAt: firstInteractionSummary && text.includes('今天') ? now : undefined,
    firstInteractionSummary,
    nextAction: extractNextAction(firstInteractionSummary),
  }
}

function extractCity(text: string): string {
  const knownCity = [
    '无锡',
    '苏州',
    '上海',
    '南京',
    '常州',
    '杭州',
    '北京',
    '天津',
    '广州',
    '深圳',
    '成都',
    '重庆',
    '武汉',
    '黄石',
    '十堰',
    '宜昌',
    '襄阳',
    '鄂州',
    '荆门',
    '孝感',
    '荆州',
    '黄冈',
    '咸宁',
    '随州',
    '恩施',
  ].find((city) => text.includes(city))
  if (knownCity) return knownCity

  return text.match(/([\u4e00-\u9fa5]{2,4})的客户/)?.[1] ?? ''
}

function extractWechatName(text: string): string {
  return text.match(/客户微信名\s*([^\s，,。]+)/)?.[1] ?? ''
}

function extractNameHint(text: string): string {
  const explicit = text.match(/的([\u4e00-\u9fa5A-Za-z]{1,8}(?:总|女士|先生|老师|经理))/)?.[1]
  if (explicit) return explicit

  return text.match(/([\u4e00-\u9fa5A-Za-z]{1,8}(?:总|女士|先生|老师|经理))/)?.[1] ?? ''
}

function extractNeedToAdd(text: string): string {
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

function extractCustomerUpdateFieldsFromText(text: string): Omit<CustomerUpdateDraft, 'customerId' | 'customerName' | 'city'> {
  const budgetWan = extractBudgetWan(text)
  const areaSqm = numberFrom(text.match(/(\d+(?:\.\d+)?)\s*(?:平|平米|㎡)/)?.[1])
  const propertyType = extractPropertyType(text)
  const household = extractHousehold(text)
  const sourceChannel = extractSourceChannel(text)
  const stylePreference = extractStylePreference(text)
  const need = extractNeedToAdd(text)
  const needs = extractNeeds(text)

  return {
    ...(need ? { need } : {}),
    ...(needs.length ? { needs } : {}),
    ...(budgetWan !== undefined ? { budgetWan } : {}),
    ...(areaSqm !== undefined ? { areaSqm } : {}),
    ...(propertyType ? { propertyType } : {}),
    ...(household ? { household } : {}),
    ...(sourceChannel ? { sourceChannel } : {}),
    ...(stylePreference ? { stylePreference } : {}),
  }
}

function extractCommunicationSummary(text: string): string {
  return (
    text.match(/沟通内容(?:为|是)?\s*(.*?)(?=\s*是否|[，。]|$)/)?.[1]?.trim() ??
    ''
  )
}

function extractDemandDate(text: string): string | undefined {
  return text.match(/需求日期\s*([^\s，,。]+)/)?.[1]
}

function extractUrgent(text: string): boolean | undefined {
  if (text.includes('不加急') || text.includes('加急 否') || text.includes('加急否')) return false
  if (text.includes('希望加急') || text.includes('加急 是') || text.includes('加急是')) return true
  return undefined
}

function extractServiceValue(text: string): string | undefined {
  if (text.includes('无服务价值') || text.includes('没有服务价值')) return '无'
  if (text.includes('有服务价值')) return '有'
  return undefined
}

function extractNextAction(summary: string): string {
  if (!summary) return ''
  return /拜托|要求|需要|请|给|去|图纸|工地/.test(summary) ? summary : ''
}

function extractPropertyType(text: string): string {
  return ['大平层', '高层', '别墅', '洋房', '复式', '老房', '新房'].find((propertyType) => text.includes(propertyType)) ?? ''
}

function extractHouseholdPhrase(text: string): string {
  if (text.includes('三口之家') || text.includes('一家三口')) return '三口之家'
  if (text.includes('四口之家') || text.includes('一家四口')) return '四口之家'
  if (text.includes('两口之家') || text.includes('二人世界')) return '两口之家'
  if (text.includes('独居')) return '独居'
  if (text.includes('老人')) return '有老人'
  return ''
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

function extractNeeds(text: string): string[] {
  const needs = []
  if (text.includes('智能家居')) needs.push('智能家居')
  if (text.includes('整体浴室')) needs.push('整体浴室')
  if (text.includes('全屋定制')) needs.push('全屋定制')
  if (text.includes('中央空调')) needs.push('中央空调')
  if (text.includes('宠物') || text.includes('养猫') || text.includes('养了一只猫') || text.includes('养了只猫')) {
    needs.push('家里有宠物')
  }
  return needs
}

function extractSourceChannel(text: string): string | undefined {
  const channels = ['老客户转介绍', '朋友介绍', '小红书', '抖音', '自然到店']
  return channels.find((channel) => text.includes(channel))
}

function extractStylePreference(text: string): string | undefined {
  const styles = ['现代简约', '奶油风', '原木风', '侘寂', '轻奢']
  return styles.find((style) => text.includes(style))
}

function numberFrom(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function extractBudgetWan(text: string): number | undefined {
  return numberFrom(text.match(/预算(?:调整为|改为|改到|调整到|是)?\s*(\d+(?:\.\d+)?)\s*(?:w|万)/i)?.[1])
}
