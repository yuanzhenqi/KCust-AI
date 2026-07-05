import { describe, expect, it } from 'vitest'
import { BUILT_IN_MODEL_BASE_URL } from '../domain/modelConfig'
import { DEFAULT_PROFILE_FIELD_DEFINITIONS } from '../domain/profileFields'
import { createLocalRepository, type KeyValueStorage } from './localRepository'
import type {
  CalendarEventLink,
  Customer,
  CustomerProfile,
  Interaction,
  NeedTag,
  Reminder,
  AssistantHistoryMessage,
  Todo,
} from '../domain/types'

class MemoryStorage implements KeyValueStorage {
  private values = new Map<string, string>()

  get(key: string): string | null {
    return this.values.get(key) ?? null
  }

  set(key: string, value: string): void {
    this.values.set(key, value)
  }
}

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

const assistantHistoryMessage: AssistantHistoryMessage = {
  id: 'assistant-history-1',
  role: 'user',
  text: '我在无锡有哪些客户',
  createdAt: '2026-05-25T21:00:00.000+08:00',
}

describe('local repository', () => {
  it('persists customers through the provided local key-value storage', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)

    repository.saveCustomer(customer)

    const reloaded = createLocalRepository(storage)
    expect(reloaded.listCustomers()).toEqual([customer])
  })

  it('updates and deletes customers without mutating unrelated records', () => {
    const repository = createLocalRepository(new MemoryStorage())
    repository.saveCustomer(customer)
    repository.saveCustomer({ ...customer, id: 'c-li', name: '李女士', city: '苏州' })

    repository.saveCustomer({ ...customer, needs: ['智能家居', '整体浴室'] })
    repository.deleteCustomer('c-li')

    expect(repository.listCustomers()).toEqual([{ ...customer, needs: ['智能家居', '整体浴室'] }])
  })

  it('stores todos and can mark a todo complete', () => {
    const repository = createLocalRepository(new MemoryStorage())
    const todo: Todo = {
      id: 'todo-1',
      customerId: 'c-zhang',
      title: '回访方案',
      dueAt: '2026-05-26T20:00:00.000+08:00',
      completed: false,
    }

    repository.saveTodo(todo)
    repository.completeTodo('todo-1')

    expect(repository.listTodos()).toEqual([{ ...todo, completed: true }])
  })

  it('stores and reads the model api key', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)

    repository.saveModelApiKey('sk-local-test')

    const reloaded = createLocalRepository(storage)
    expect(reloaded.getModelApiKey()).toBe('sk-local-test')
  })

  it('stores and reloads assistant history messages', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)

    repository.saveAssistantHistory([
      assistantHistoryMessage,
      { ...assistantHistoryMessage, id: 'assistant-history-2', role: 'assistant', text: '张总｜无锡｜50w' },
    ])

    const reloaded = createLocalRepository(storage)
    expect(reloaded.listAssistantHistory()).toEqual([
      assistantHistoryMessage,
      { ...assistantHistoryMessage, id: 'assistant-history-2', role: 'assistant', text: '张总｜无锡｜50w' },
    ])
  })

  it('stores and normalizes model configuration separately from the api key', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)

    repository.saveModelApiKey('sk-local-test')
    repository.saveModelConfig({
      provider: 'openai-compatible',
      baseUrl: 'https://model.example.test/v1/',
      model: 'kcust-model',
    })

    const reloaded = createLocalRepository(storage)
    expect(reloaded.getModelApiKey()).toBe('sk-local-test')
    expect(reloaded.getModelConfig()).toEqual({
      provider: 'openai-compatible',
      baseUrl: 'https://model.example.test/v1',
      model: 'kcust-model',
    })
  })

  it('stores and reloads floating assistant overlay configuration', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)

    repository.saveOverlayConfig({ dockSide: 'right', size: 'large', opacity: 0.8 })

    const reloaded = createLocalRepository(storage)
    expect(reloaded.getOverlayConfig()).toEqual({ dockSide: 'right', size: 'large', opacity: 0.8 })
  })

  it('stores and reloads custom profile field definitions', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)

    expect(repository.listProfileFieldDefinitions()).toEqual(DEFAULT_PROFILE_FIELD_DEFINITIONS)

    repository.saveProfileFieldDefinitions([
      ...DEFAULT_PROFILE_FIELD_DEFINITIONS,
      {
        id: 'profile-field-decisionMaker',
        key: 'decisionMaker',
        label: '决策人',
        description: '最终拍板人',
        type: 'text',
        enabled: true,
        showInSummary: true,
        extractionHint: '提取客户提到的最终决策人',
        order: 10,
      },
    ])

    const reloaded = createLocalRepository(storage)
    expect(reloaded.listProfileFieldDefinitions().map((field) => field.key)).toEqual([
      'budgetWan',
      'household',
      'sourceChannel',
      'stylePreference',
      'nextFollowUpAt',
      'decisionMaker',
    ])
  })

  it('falls back to default model configuration when stored config is malformed', () => {
    const storage = new MemoryStorage()
    storage.set('kcust.modelConfig', '{bad json')

    const repository = createLocalRepository(storage)

    expect(repository.getModelConfig()).toEqual({
      provider: 'openai-compatible',
      baseUrl: BUILT_IN_MODEL_BASE_URL,
      model: 'MiniMax-M3',
    })
  })

  it('stores, updates, reloads, and deletes customer profiles', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)
    const profile: CustomerProfile = {
      customerId: 'c-zhang',
      contactName: '张总',
      phone: '13800000000',
      wechat: 'zhang-home',
      address: '无锡滨湖区',
      sourceChannel: '老客户转介绍',
      stylePreference: '现代简洁',
      budgetConfidence: 'medium',
      updatedAt: '2026-05-26T10:00:00.000+08:00',
    }

    repository.saveProfile(profile)
    repository.saveProfile({ ...profile, budgetConfidence: 'high' })

    const reloaded = createLocalRepository(storage)
    expect(reloaded.listProfiles()).toEqual([{ ...profile, budgetConfidence: 'high' }])

    reloaded.deleteProfile('c-zhang')
    expect(repository.listProfiles()).toEqual([])
  })

  it('stores, updates, reloads, and deletes need tags', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)
    const needTag: NeedTag = {
      id: 'tag-1',
      customerId: 'c-zhang',
      label: '需要儿童房收纳',
      source: 'agent',
      createdAt: '2026-05-26T10:05:00.000+08:00',
    }

    repository.saveNeedTag(needTag)
    repository.saveNeedTag({ ...needTag, label: '儿童房收纳' })

    const reloaded = createLocalRepository(storage)
    expect(reloaded.listNeedTags()).toEqual([{ ...needTag, label: '儿童房收纳' }])

    reloaded.deleteNeedTag('tag-1')
    expect(repository.listNeedTags()).toEqual([])
  })

  it('stores, updates, reloads, and deletes interactions', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)
    const interaction: Interaction = {
      id: 'interaction-1',
      customerId: 'c-zhang',
      channel: 'wechat',
      summary: '确认喜欢暖色系方案',
      happenedAt: '2026-05-26T11:00:00.000+08:00',
      nextAction: '发送新版报价',
      createdAt: '2026-05-26T11:10:00.000+08:00',
    }

    repository.saveInteraction(interaction)
    repository.saveInteraction({ ...interaction, nextAction: '预约现场复尺' })

    const reloaded = createLocalRepository(storage)
    expect(reloaded.listInteractions()).toEqual([{ ...interaction, nextAction: '预约现场复尺' }])

    reloaded.deleteInteraction('interaction-1')
    expect(repository.listInteractions()).toEqual([])
  })

  it('stores, updates, reloads, and deletes reminders', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)
    const reminder: Reminder = {
      id: 'reminder-1',
      todoId: 'todo-1',
      customerId: 'c-zhang',
      title: '回访方案',
      scheduledAt: '2026-05-27T09:00:00.000+08:00',
      channel: 'app-and-calendar',
      status: 'scheduled',
      createdAt: '2026-05-26T11:20:00.000+08:00',
    }

    repository.saveReminder(reminder)
    repository.saveReminder({ ...reminder, status: 'app-only' })

    const reloaded = createLocalRepository(storage)
    expect(reloaded.listReminders()).toEqual([{ ...reminder, status: 'app-only' }])

    reloaded.deleteReminder('reminder-1')
    expect(repository.listReminders()).toEqual([])
  })

  it('stores, updates, reloads, and deletes calendar event links', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)
    const calendarEventLink: CalendarEventLink = {
      id: 'calendar-link-1',
      reminderId: 'reminder-1',
      todoId: 'todo-1',
      providerEventId: 'provider-event-1',
      calendarId: 'primary',
      status: 'failed',
      failureReason: 'permission denied',
      createdAt: '2026-05-26T11:30:00.000+08:00',
    }

    repository.saveCalendarEventLink(calendarEventLink)
    repository.saveCalendarEventLink({ ...calendarEventLink, status: 'linked', failureReason: null })

    const reloaded = createLocalRepository(storage)
    expect(reloaded.listCalendarEventLinks()).toEqual([
      { ...calendarEventLink, status: 'linked', failureReason: null },
    ])

    reloaded.deleteCalendarEventLink('calendar-link-1')
    expect(repository.listCalendarEventLinks()).toEqual([])
  })
})
