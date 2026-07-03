import type { LocalRepository } from './localRepository'
import type { ModelConfig } from '../domain/modelConfig'
import type { LocalSnapshot } from '../domain/types'

type LocalSchemaSnapshot = LocalSnapshot & {
  modelConfig: ModelConfig[]
}

export const LOCAL_SCHEMA_VERSION = 1

export const LOCAL_SCHEMA_TABLES = [
  'customers',
  'todos',
  'profiles',
  'needTags',
  'interactions',
  'reminders',
  'calendarEventLinks',
  'assistantHistory',
  'modelConfig',
] as const

export function createEmptySnapshot(): LocalSchemaSnapshot {
  return {
    version: LOCAL_SCHEMA_VERSION,
    customers: [],
    todos: [],
    profiles: [],
    needTags: [],
    interactions: [],
    reminders: [],
    calendarEventLinks: [],
    assistantHistory: [],
    modelConfig: [],
  }
}

export function snapshotFromRepository(repository: LocalRepository): LocalSchemaSnapshot {
  return {
    version: LOCAL_SCHEMA_VERSION,
    customers: repository.listCustomers(),
    todos: repository.listTodos(),
    profiles: repository.listProfiles(),
    needTags: repository.listNeedTags(),
    interactions: repository.listInteractions(),
    reminders: repository.listReminders(),
    calendarEventLinks: repository.listCalendarEventLinks(),
    assistantHistory: repository.listAssistantHistory(),
    modelConfig: [repository.getModelConfig()],
  }
}
