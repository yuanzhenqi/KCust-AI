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
import { parseStoredModelConfig, serializeModelConfig, type ModelConfig } from '../domain/modelConfig'
import { parseStoredOverlayConfig, serializeOverlayConfig, type OverlayConfig } from '../domain/overlayConfig'

export interface KeyValueStorage {
  get(key: string): string | null
  set(key: string, value: string): void
}

export interface LocalRepository {
  listCustomers(): Customer[]
  saveCustomer(customer: Customer): void
  deleteCustomer(customerId: string): void
  listTodos(): Todo[]
  saveTodo(todo: Todo): void
  completeTodo(todoId: string): void
  listProfiles(): CustomerProfile[]
  saveProfile(profile: CustomerProfile): void
  deleteProfile(customerId: string): void
  listNeedTags(): NeedTag[]
  saveNeedTag(needTag: NeedTag): void
  deleteNeedTag(needTagId: string): void
  listInteractions(): Interaction[]
  saveInteraction(interaction: Interaction): void
  deleteInteraction(interactionId: string): void
  listReminders(): Reminder[]
  saveReminder(reminder: Reminder): void
  deleteReminder(reminderId: string): void
  listCalendarEventLinks(): CalendarEventLink[]
  saveCalendarEventLink(calendarEventLink: CalendarEventLink): void
  deleteCalendarEventLink(calendarEventLinkId: string): void
  listAssistantHistory(): AssistantHistoryMessage[]
  saveAssistantHistory(messages: AssistantHistoryMessage[]): void
  getModelApiKey(): string
  saveModelApiKey(apiKey: string): void
  getModelConfig(): ModelConfig
  saveModelConfig(config: Partial<ModelConfig>): void
  getOverlayConfig(): OverlayConfig
  saveOverlayConfig(config: Partial<OverlayConfig>): void
}

const CUSTOMER_KEY = 'kcust.customers'
const TODO_KEY = 'kcust.todos'
const PROFILE_KEY = 'kcust.profiles'
const NEED_TAG_KEY = 'kcust.needTags'
const INTERACTION_KEY = 'kcust.interactions'
const REMINDER_KEY = 'kcust.reminders'
const CALENDAR_EVENT_LINK_KEY = 'kcust.calendarEventLinks'
const ASSISTANT_HISTORY_KEY = 'kcust.assistantHistory'
const MODEL_API_KEY = 'kcust.modelApiKey'
const MODEL_CONFIG_KEY = 'kcust.modelConfig'
const OVERLAY_CONFIG_KEY = 'kcust.overlayConfig'

export function createLocalRepository(storage: KeyValueStorage): LocalRepository {
  return {
    listCustomers() {
      return readArray<Customer>(storage, CUSTOMER_KEY)
    },
    saveCustomer(customer) {
      const customers = readArray<Customer>(storage, CUSTOMER_KEY)
      const next = upsertById(customers, customer)
      writeArray(storage, CUSTOMER_KEY, next)
    },
    deleteCustomer(customerId) {
      writeArray(
        storage,
        CUSTOMER_KEY,
        readArray<Customer>(storage, CUSTOMER_KEY).filter((customer) => customer.id !== customerId),
      )
    },
    listTodos() {
      return readArray<Todo>(storage, TODO_KEY)
    },
    saveTodo(todo) {
      const todos = readArray<Todo>(storage, TODO_KEY)
      writeArray(storage, TODO_KEY, upsertById(todos, todo))
    },
    completeTodo(todoId) {
      const todos = readArray<Todo>(storage, TODO_KEY)
      writeArray(
        storage,
        TODO_KEY,
        todos.map((todo) => (todo.id === todoId ? { ...todo, completed: true } : todo)),
      )
    },
    listProfiles() {
      return readArray<CustomerProfile>(storage, PROFILE_KEY)
    },
    saveProfile(profile) {
      const profiles = readArray<CustomerProfile>(storage, PROFILE_KEY)
      writeArray(storage, PROFILE_KEY, upsertByCustomerId(profiles, profile))
    },
    deleteProfile(customerId) {
      writeArray(
        storage,
        PROFILE_KEY,
        readArray<CustomerProfile>(storage, PROFILE_KEY).filter((profile) => profile.customerId !== customerId),
      )
    },
    listNeedTags() {
      return readArray<NeedTag>(storage, NEED_TAG_KEY)
    },
    saveNeedTag(needTag) {
      const needTags = readArray<NeedTag>(storage, NEED_TAG_KEY)
      writeArray(storage, NEED_TAG_KEY, upsertById(needTags, needTag))
    },
    deleteNeedTag(needTagId) {
      writeArray(
        storage,
        NEED_TAG_KEY,
        readArray<NeedTag>(storage, NEED_TAG_KEY).filter((needTag) => needTag.id !== needTagId),
      )
    },
    listInteractions() {
      return readArray<Interaction>(storage, INTERACTION_KEY)
    },
    saveInteraction(interaction) {
      const interactions = readArray<Interaction>(storage, INTERACTION_KEY)
      writeArray(storage, INTERACTION_KEY, upsertById(interactions, interaction))
    },
    deleteInteraction(interactionId) {
      writeArray(
        storage,
        INTERACTION_KEY,
        readArray<Interaction>(storage, INTERACTION_KEY).filter((interaction) => interaction.id !== interactionId),
      )
    },
    listReminders() {
      return readArray<Reminder>(storage, REMINDER_KEY)
    },
    saveReminder(reminder) {
      const reminders = readArray<Reminder>(storage, REMINDER_KEY)
      writeArray(storage, REMINDER_KEY, upsertById(reminders, reminder))
    },
    deleteReminder(reminderId) {
      writeArray(
        storage,
        REMINDER_KEY,
        readArray<Reminder>(storage, REMINDER_KEY).filter((reminder) => reminder.id !== reminderId),
      )
    },
    listCalendarEventLinks() {
      return readArray<CalendarEventLink>(storage, CALENDAR_EVENT_LINK_KEY)
    },
    saveCalendarEventLink(calendarEventLink) {
      const calendarEventLinks = readArray<CalendarEventLink>(storage, CALENDAR_EVENT_LINK_KEY)
      writeArray(storage, CALENDAR_EVENT_LINK_KEY, upsertById(calendarEventLinks, calendarEventLink))
    },
    deleteCalendarEventLink(calendarEventLinkId) {
      writeArray(
        storage,
        CALENDAR_EVENT_LINK_KEY,
        readArray<CalendarEventLink>(storage, CALENDAR_EVENT_LINK_KEY).filter(
          (calendarEventLink) => calendarEventLink.id !== calendarEventLinkId,
        ),
      )
    },
    listAssistantHistory() {
      return readArray<AssistantHistoryMessage>(storage, ASSISTANT_HISTORY_KEY)
    },
    saveAssistantHistory(messages) {
      writeArray(storage, ASSISTANT_HISTORY_KEY, messages)
    },
    getModelApiKey() {
      return storage.get(MODEL_API_KEY) ?? ''
    },
    saveModelApiKey(apiKey) {
      storage.set(MODEL_API_KEY, apiKey.trim())
    },
    getModelConfig() {
      return parseStoredModelConfig(storage.get(MODEL_CONFIG_KEY))
    },
    saveModelConfig(config) {
      storage.set(MODEL_CONFIG_KEY, serializeModelConfig(config))
    },
    getOverlayConfig() {
      return parseStoredOverlayConfig(storage.get(OVERLAY_CONFIG_KEY))
    },
    saveOverlayConfig(config) {
      storage.set(OVERLAY_CONFIG_KEY, serializeOverlayConfig(config))
    },
  }
}

export const browserStorage: KeyValueStorage = {
  get(key) {
    if (!hasBrowserLocalStorage()) return null
    return localStorage.getItem(key)
  },
  set(key, value) {
    if (!hasBrowserLocalStorage()) return
    localStorage.setItem(key, value)
  },
}

function readArray<T>(storage: KeyValueStorage, key: string): T[] {
  const raw = storage.get(key)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeArray<T>(storage: KeyValueStorage, key: string, values: T[]): void {
  storage.set(key, JSON.stringify(values))
}

function upsertById<T extends { id: string }>(values: T[], value: T): T[] {
  const existingIndex = values.findIndex((entry) => entry.id === value.id)
  if (existingIndex === -1) return [...values, value]

  return values.map((entry, index) => (index === existingIndex ? value : entry))
}

function upsertByCustomerId<T extends { customerId: string }>(values: T[], value: T): T[] {
  const existingIndex = values.findIndex((entry) => entry.customerId === value.customerId)
  if (existingIndex === -1) return [...values, value]

  return values.map((entry, index) => (index === existingIndex ? value : entry))
}

function hasBrowserLocalStorage(): boolean {
  return (
    typeof localStorage !== 'undefined' &&
    typeof localStorage.getItem === 'function' &&
    typeof localStorage.setItem === 'function'
  )
}
