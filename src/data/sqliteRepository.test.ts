import { describe, expect, it } from 'vitest'
import { createEmptySnapshot, LOCAL_SCHEMA_TABLES, LOCAL_SCHEMA_VERSION, snapshotFromRepository } from './schema'
import { createSqliteShapedRepository } from './sqliteRepository'
import type { KeyValueStorage } from './localRepository'
import type {
  CalendarEventLink,
  Customer,
  CustomerProfile,
  Interaction,
  NeedTag,
  Reminder,
  Todo,
} from '../domain/types'
import { DEFAULT_PROFILE_FIELD_DEFINITIONS } from '../domain/profileFields'

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

const todo: Todo = {
  id: 'todo-1',
  customerId: 'c-zhang',
  title: '回访方案',
  dueAt: '2026-05-26T20:00:00.000+08:00',
  completed: false,
}

const profile: CustomerProfile = {
  customerId: 'c-zhang',
  contactName: '张总',
  phone: '13800000000',
  wechat: 'zhang-home',
  address: '无锡滨湖区',
  sourceChannel: '老客户转介绍',
  stylePreference: '现代简洁',
  budgetConfidence: 'high',
  updatedAt: '2026-05-26T10:00:00.000+08:00',
}

const needTag: NeedTag = {
  id: 'tag-1',
  customerId: 'c-zhang',
  label: '儿童房收纳',
  source: 'manual',
  createdAt: '2026-05-26T10:05:00.000+08:00',
}

const interaction: Interaction = {
  id: 'interaction-1',
  customerId: 'c-zhang',
  channel: 'meeting',
  summary: '确认平面方案',
  happenedAt: '2026-05-26T11:00:00.000+08:00',
  nextAction: '发送报价',
  createdAt: '2026-05-26T11:10:00.000+08:00',
}

const reminder: Reminder = {
  id: 'reminder-1',
  todoId: 'todo-1',
  customerId: 'c-zhang',
  title: '发送报价',
  scheduledAt: '2026-05-27T09:00:00.000+08:00',
  channel: 'app',
  status: 'scheduled',
  createdAt: '2026-05-26T11:20:00.000+08:00',
}

const calendarEventLink: CalendarEventLink = {
  id: 'calendar-link-1',
  reminderId: 'reminder-1',
  todoId: 'todo-1',
  providerEventId: 'provider-event-1',
  calendarId: 'primary',
  status: 'linked',
  failureReason: null,
  createdAt: '2026-05-26T11:30:00.000+08:00',
}

describe('sqlite-shaped repository', () => {
  it('implements the local repository contract for customers, todos, and new data models', () => {
    const storage = new MemoryStorage()
    const repository = createSqliteShapedRepository(storage)

    repository.saveCustomer(customer)
    repository.saveTodo(todo)
    repository.saveProfile(profile)
    repository.saveNeedTag(needTag)
    repository.saveInteraction(interaction)
    repository.saveReminder(reminder)
    repository.saveCalendarEventLink(calendarEventLink)
    repository.saveModelConfig({
      provider: 'openai-compatible',
      baseUrl: 'https://model.example.test/v1/',
      model: 'kcust-model',
    })
    repository.completeTodo('todo-1')

    const reloaded = createSqliteShapedRepository(storage)
    expect(reloaded.listCustomers()).toEqual([customer])
    expect(reloaded.listTodos()).toEqual([{ ...todo, completed: true }])
    expect(reloaded.listProfiles()).toEqual([profile])
    expect(reloaded.listNeedTags()).toEqual([needTag])
    expect(reloaded.listInteractions()).toEqual([interaction])
    expect(reloaded.listReminders()).toEqual([reminder])
    expect(reloaded.listCalendarEventLinks()).toEqual([calendarEventLink])
    expect(reloaded.getModelConfig()).toEqual({
      provider: 'openai-compatible',
      baseUrl: 'https://model.example.test/v1',
      model: 'kcust-model',
    })
  })
})

describe('local schema snapshot', () => {
  it('creates an empty versioned snapshot with all schema tables', () => {
    expect(LOCAL_SCHEMA_VERSION).toBe(1)
    expect(LOCAL_SCHEMA_TABLES).toEqual([
      'customers',
      'todos',
      'profiles',
      'needTags',
      'interactions',
      'reminders',
      'calendarEventLinks',
      'assistantHistory',
      'profileFieldDefinitions',
      'modelConfig',
    ])
    expect(createEmptySnapshot()).toEqual({
      version: 1,
      customers: [],
      todos: [],
      profiles: [],
      needTags: [],
      interactions: [],
      reminders: [],
      calendarEventLinks: [],
      assistantHistory: [],
      profileFieldDefinitions: [],
      modelConfig: [],
    })
  })

  it('builds a full snapshot from a repository', () => {
    const repository = createSqliteShapedRepository(new MemoryStorage())

    repository.saveCustomer(customer)
    repository.saveTodo(todo)
    repository.saveProfile(profile)
    repository.saveNeedTag(needTag)
    repository.saveInteraction(interaction)
    repository.saveReminder(reminder)
    repository.saveCalendarEventLink(calendarEventLink)
    repository.saveModelConfig({
      provider: 'openai-compatible',
      baseUrl: 'https://model.example.test/v1/',
      model: 'kcust-model',
    })

    expect(snapshotFromRepository(repository)).toEqual({
      version: 1,
      customers: [customer],
      todos: [todo],
      profiles: [profile],
      needTags: [needTag],
      interactions: [interaction],
      reminders: [reminder],
      calendarEventLinks: [calendarEventLink],
      assistantHistory: [],
      profileFieldDefinitions: DEFAULT_PROFILE_FIELD_DEFINITIONS,
      modelConfig: [
        {
          provider: 'openai-compatible',
          baseUrl: 'https://model.example.test/v1',
          model: 'kcust-model',
        },
      ],
    })
  })
})
