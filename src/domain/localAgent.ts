import { parseAssistantCommand, type AssistantCommand } from './aiInterpreter'
import {
  buildNextStepSuggestion,
  filterCustomersByCity,
  findBestCustomerMatch,
  scoreCustomerHealth,
} from './customerLogic'
import type { Customer, Interaction, Todo } from './types'

const TOOL_TRACE = ['本地待办扫描', '客户健康度评分', '下一步建议生成']
const HUBEI_CITIES = ['武汉', '黄石', '十堰', '宜昌', '襄阳', '鄂州', '荆门', '孝感', '荆州', '黄冈', '咸宁', '随州', '恩施']

export function runLocalAgent(
  input: string,
  context: { customers: Customer[]; todos: Todo[]; now: string; interactions?: Interaction[] },
): AssistantCommand {
  const text = input.trim()

  if (isGreeting(text) || isCapabilityQuestion(text)) {
    return {
      kind: 'agent-answer',
      requiresConfirmation: false,
      title: '本地 Agent',
      payload: {
        message: buildCapabilityAnswer(text),
        toolTrace: ['本地对话', '能力说明'],
      },
    }
  }

  if (isHubeiCityCommunicationQuestion(text)) {
    return {
      kind: 'agent-answer',
      requiresConfirmation: false,
      title: '本地 Agent 查询',
      payload: {
        message: buildProvinceCityCommunicationAnswer(context.customers),
        toolTrace: ['本地客户筛选', '省份城市汇总'],
      },
    }
  }

  if (isPendingCommunicationActionQuestion(text)) {
    return {
      kind: 'agent-answer',
      requiresConfirmation: false,
      title: '本地 Agent 查询',
      payload: {
        message: buildPendingCommunicationActionAnswer(context.customers, context.interactions ?? []),
        toolTrace: ['本地沟通记录扫描', '待处理动作提取'],
      },
    }
  }

  if (isFiveDayNoContactQuestion(text)) {
    return {
      kind: 'agent-answer',
      requiresConfirmation: false,
      title: '本地 Agent 查询',
      payload: {
        message: buildFiveDayNoContactAnswer(context.customers, context.now),
        toolTrace: ['本地客户筛选', '最近沟通日期计算'],
      },
    }
  }

  if (isPriorityQuestion(text)) {
    return {
      kind: 'agent-answer',
      requiresConfirmation: false,
      title: '本地 Agent 建议',
      payload: {
        message: buildPriorityFollowUpAnswer(context.customers, context.todos, context.now),
        toolTrace: TOOL_TRACE,
      },
    }
  }

  if (isNextStepQuestion(text) || isNamedFollowUpQuestion(text)) {
    const customer = findBestCustomerMatch(context.customers, undefined, extractNameHint(text))
    if (customer) {
      return {
        kind: 'agent-answer',
        requiresConfirmation: false,
        title: '本地 Agent 建议',
        payload: {
          message: buildCustomerNextStepAnswer(customer, context.todos, context.now),
          toolTrace: ['客户匹配', '客户健康度评分', '下一步建议生成'],
        },
      }
    }
  }

  if (isAmbiguousUpdateQuestion(text)) {
    const city = extractCity(text)
    const nameHint = extractNameHint(text)
    const matches = city ? filterCustomersByCity(context.customers, city) : []

    if (!nameHint && matches.length > 1) {
      return {
        kind: 'agent-answer',
        requiresConfirmation: false,
        title: '需要确认客户',
        payload: {
          message: `我找到了 ${matches.length} 位${city}客户：${matches.map((customer) => customer.name).join('、')}。请补充客户姓名后我再生成修改草稿。`,
          toolTrace: ['客户匹配', '歧义检查'],
        },
      }
    }
  }

  return parseAssistantCommand(input, context.customers, context.now)
}

function buildCapabilityAnswer(text: string): string {
  const prefix = isGreeting(text) ? '你好，我在。' : ''
  return `${prefix}我可以和你正常聊天，也可以帮你做新增客户、客户增删改查、查询本地客户库、补充客户需求、创建提醒和一次性提醒、生成跟进建议、查看健康度原因和画像聚类。涉及新增、修改、提醒这类写入动作时，我会先生成确认卡片，确认后再保存。`
}

function isGreeting(text: string): boolean {
  const normalized = text.replace(/[，。！？!?\s]/g, '')
  return ['你好', '您好', '哈喽', 'hello', 'hi'].includes(normalized.toLowerCase())
}

function isCapabilityQuestion(text: string): boolean {
  return (
    text.includes('你能做什么') ||
    text.includes('你可以做什么') ||
    text.includes('有什么功能') ||
    text.includes('怎么用') ||
    text.includes('帮我什么')
  )
}

function buildProvinceCityCommunicationAnswer(customers: Customer[]): string {
  const activeCustomers = customers.filter((customer) => (
    HUBEI_CITIES.includes(customer.city) &&
    customer.stage !== '流失' &&
    Boolean(customer.lastInteractionAt)
  ))

  if (!activeCustomers.length) return '湖北省内暂时没有找到沟通中的客户。'

  const cityGroups = new Map<string, string[]>()
  activeCustomers.forEach((customer) => {
    cityGroups.set(customer.city, [...(cityGroups.get(customer.city) ?? []), customer.name])
  })

  const summary = [...cityGroups.entries()]
    .map(([city, names]) => `${city}：${names.join('、')}`)
    .join('；')

  return `湖北省沟通中的客户分布：${summary}。`
}

function buildPendingCommunicationActionAnswer(customers: Customer[], interactions: Interaction[]): string {
  const actions = interactions
    .map((interaction) => {
      const action = interaction.nextAction.trim() || extractActionFromSummary(interaction.summary)
      const customer = customers.find((entry) => entry.id === interaction.customerId)
      return customer && action ? { customer, action, happenedAt: interaction.happenedAt } : null
    })
    .filter((entry): entry is { customer: Customer; action: string; happenedAt: string } => Boolean(entry))
    .sort((left, right) => new Date(right.happenedAt).getTime() - new Date(left.happenedAt).getTime())

  if (!actions.length) return '最近沟通记录里没有发现明确需要处理的客户事项。'

  return `最近需要处理的客户：${actions.map((entry) => `${entry.customer.name}：${entry.action}`).join('；')}。`
}

function buildFiveDayNoContactAnswer(customers: Customer[], now: string): string {
  const staleCustomers = customers
    .map((customer) => ({
      customer,
      days: customer.lastInteractionAt ? daysBetween(customer.lastInteractionAt, now) : Number.POSITIVE_INFINITY,
    }))
    .filter((entry) => entry.days >= 5)
    .sort((left, right) => right.days - left.days)

  if (!staleCustomers.length) return '没有发现 5 天以上未联系的客户。'

  return `5 天以上未联系的客户：${staleCustomers.map((entry) => `${entry.customer.name}（${formatDays(entry.days)}）`).join('、')}。`
}

function buildPriorityFollowUpAnswer(customers: Customer[], todos: Todo[], now: string): string {
  const rankedEntries = customers
    .map((customer) => {
      const health = scoreCustomerHealth(customer, todos, now)
      const openTodos = todos.filter((todo) => todo.customerId === customer.id && !todo.completed)
      const overdueTodos = openTodos.filter((todo) => todo.dueAt && new Date(todo.dueAt) < new Date(now))
      const nextTodo = [...overdueTodos, ...openTodos].sort(compareTodosByDueAt)[0]
      const priority = overdueTodos.length * 100 + (100 - health.score) + (nextTodo ? 10 : 0)
      return { customer, health, nextTodo, priority }
    })
    .filter((entry) => entry.priority > 0)
    .sort((left, right) => right.priority - left.priority)

  if (!rankedEntries.length) return '今天没有发现必须跟进的客户。建议检查新增线索，补齐预算、需求和下次跟进时间。'

  const top = rankedEntries[0]
  const reason = top.health.reasons.join('、')
  const todoText = top.nextTodo ? `当前动作：${top.nextTodo.title}（${formatDateTime(top.nextTodo.dueAt)}）。` : ''
  const suggestion = buildNextStepSuggestion(top.customer, todos, now)

  return `优先跟进${top.customer.name}。${todoText}健康度 ${top.health.score}，原因：${reason}。${suggestion}`
}

function buildCustomerNextStepAnswer(customer: Customer, todos: Todo[], now: string): string {
  const health = scoreCustomerHealth(customer, todos, now)
  const suggestion = buildNextStepSuggestion(customer, todos, now)

  return `${customer.name}下一步建议：${suggestion} 健康度 ${health.score}，原因：${health.reasons.join('、')}。`
}

function isPriorityQuestion(text: string): boolean {
  return (text.includes('今天') || text.includes('现在')) && (text.includes('跟进谁') || text.includes('该跟进') || text.includes('优先跟进'))
}

function isNextStepQuestion(text: string): boolean {
  return text.includes('下一步') || text.includes('怎么跟进') || text.includes('如何跟进')
}

function isNamedFollowUpQuestion(text: string): boolean {
  return Boolean(extractNameHint(text)) && (text.includes('呢') || text.startsWith('那'))
}

function isAmbiguousUpdateQuestion(text: string): boolean {
  return text.includes('客户') && (text.includes('需要加') || text.includes('增加') || text.includes('添加需求'))
}

function isHubeiCityCommunicationQuestion(text: string): boolean {
  return text.includes('湖北省') && text.includes('地级市') && text.includes('沟通中') && text.includes('客户')
}

function isPendingCommunicationActionQuestion(text: string): boolean {
  if (text.includes('记录客户信息')) return false
  return text.includes('最近要处理') || (text.includes('沟通内容') && text.includes('拜托')) || text.includes('做啥事情')
}

function isFiveDayNoContactQuestion(text: string): boolean {
  return text.includes('五天没联系') || text.includes('5天没联系') || text.includes('5 天没联系')
}

function extractCity(text: string): string {
  return ['无锡', '苏州', '上海', '南京', '常州', '杭州', ...HUBEI_CITIES].find((city) => text.includes(city)) ?? ''
}

function extractNameHint(text: string): string {
  return (text.match(/([\u4e00-\u9fa5A-Za-z]{1,8}(?:总|女士|先生|老师|经理))/)?.[1] ?? '').replace(/^(那|这个|这位)/, '')
}

function compareTodosByDueAt(left: Todo, right: Todo): number {
  return new Date(left.dueAt ?? '9999-12-31T00:00:00.000+08:00').getTime() - new Date(right.dueAt ?? '9999-12-31T00:00:00.000+08:00').getTime()
}

function formatDateTime(value: string | null): string {
  if (!value) return '未设置'
  return value.replace('T', ' ').replace(':00.000+08:00', '')
}

function extractActionFromSummary(summary: string): string {
  return /拜托|要求|需要|请|给|去|图纸|工地/.test(summary) ? summary.trim() : ''
}

function daysBetween(start: string, end: string): number {
  const diff = new Date(end).getTime() - new Date(start).getTime()
  return Math.floor(diff / 86_400_000)
}

function formatDays(days: number): string {
  if (!Number.isFinite(days)) return '从未联系'
  return `${days} 天`
}
