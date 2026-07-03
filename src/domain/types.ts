export type CustomerStage = '线索' | '初聊' | '量房' | '方案' | '报价' | '成交' | '搁置' | '流失'

export type SyncStatus = 'local' | 'pending-sync' | 'synced'

export interface Customer {
  id: string
  name: string
  city: string
  budgetWan: number | null
  areaSqm: number | null
  propertyType: string
  household: string
  stage: CustomerStage
  sourceChannel?: string
  stylePreference?: string
  needs: string[]
  notes: string
  nextFollowUpAt: string | null
  lastInteractionAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
  syncStatus: SyncStatus
}

export interface CustomerDraft {
  name?: string
  wechatName?: string
  city?: string
  budgetWan?: number
  areaSqm?: number
  propertyType?: string
  household?: string
  stage?: CustomerStage
  sourceChannel?: string
  stylePreference?: string
  needs?: string[]
  notes?: string
  demandDate?: string
  urgent?: boolean
  serviceValue?: string
  firstInteractionAt?: string
  firstInteractionSummary?: string
  nextAction?: string
}

export interface CustomerUpdateDraft {
  customerId: string | null
  customerName: string
  city: string
  need?: string
  needs?: string[]
  budgetWan?: number
  areaSqm?: number
  propertyType?: string
  household?: string
  stage?: CustomerStage
  sourceChannel?: string
  stylePreference?: string
  notes?: string
}

export interface Todo {
  id: string
  customerId: string | null
  title: string
  dueAt: string | null
  completed: boolean
}

export interface ReminderDraft {
  customerId: string | null
  title: string
  scheduledAt: string
  channel: 'app-and-calendar'
  status: 'draft'
}

export interface AssistantHistoryMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: string
}

export interface CustomerProfile {
  customerId: string
  contactName: string
  phone: string
  wechat: string
  address: string
  sourceChannel: string
  stylePreference: string
  budgetConfidence: 'low' | 'medium' | 'high'
  updatedAt: string
}

export interface NeedTag {
  id: string
  customerId: string
  label: string
  source: 'manual' | 'agent'
  createdAt: string
}

export interface Interaction {
  id: string
  customerId: string
  channel: 'phone' | 'wechat' | 'site-visit' | 'meeting' | 'note'
  summary: string
  happenedAt: string
  nextAction: string
  createdAt: string
}

export interface Reminder {
  id: string
  todoId: string
  customerId: string
  title: string
  scheduledAt: string
  channel: 'app' | 'calendar' | 'app-and-calendar'
  status: 'scheduled' | 'app-only' | 'failed'
  createdAt: string
}

export interface CalendarEventLink {
  id: string
  reminderId: string
  todoId: string
  providerEventId: string
  calendarId: string
  status: 'linked' | 'failed'
  failureReason: string | null
  createdAt: string
}

export interface LocalSnapshot {
  version: number
  customers: Customer[]
  todos: Todo[]
  profiles: CustomerProfile[]
  needTags: NeedTag[]
  interactions: Interaction[]
  reminders: Reminder[]
  calendarEventLinks: CalendarEventLink[]
  assistantHistory: AssistantHistoryMessage[]
}

export interface HealthScore {
  customerId: string
  score: number
  reasons: string[]
}

export interface CustomerCluster {
  id: string
  label: string
  customerIds: string[]
  dimensions: string[]
}
