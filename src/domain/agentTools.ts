import type { AssistantCommand } from './aiInterpreter'
import { DEFAULT_PROFILE_FIELD_DEFINITIONS, normalizeProfileFieldDefinitions } from './profileFields'
import type { Customer, Interaction, ProfileFieldDefinition, Todo } from './types'

export type AgentSource = 'local' | 'model'
export type AgentToolName = Exclude<AssistantCommand['kind'], 'unknown'>

export const AGENT_TOOL_NAMES = [
  'create-customer',
  'query-customers',
  'agent-answer',
  'update-customer',
  'create-interaction',
  'create-reminder',
  'batch-actions',
] as const satisfies readonly AgentToolName[]

export type AgentCustomerSummary = Pick<
  Customer,
  | 'id'
  | 'name'
  | 'city'
  | 'budgetWan'
  | 'areaSqm'
  | 'propertyType'
  | 'household'
  | 'stage'
  | 'sourceChannel'
  | 'stylePreference'
  | 'needs'
  | 'notes'
  | 'nextFollowUpAt'
  | 'lastInteractionAt'
  | 'profileValues'
>

export type AgentTodoSummary = Pick<Todo, 'id' | 'customerId' | 'title' | 'dueAt' | 'completed'>
export type AgentInteractionSummary = Pick<Interaction, 'id' | 'customerId' | 'channel' | 'summary' | 'happenedAt' | 'nextAction'>
export type AgentProfileFieldSummary = Pick<
  ProfileFieldDefinition,
  'key' | 'label' | 'description' | 'type' | 'options' | 'enabled' | 'showInSummary' | 'extractionHint'
>

export interface AgentSendableContextSummary {
  now: string
  profileFields: AgentProfileFieldSummary[]
  customers: AgentCustomerSummary[]
  todos: AgentTodoSummary[]
  interactions: AgentInteractionSummary[]
}

export interface AgentModelDisclosure {
  provider: 'openai-compatible'
  customerCount: number
  todoCount: number
  interactionCount: number
  customerFields: ReadonlyArray<keyof AgentCustomerSummary>
  profileFieldKeys: ReadonlyArray<string>
  todoFields: ReadonlyArray<keyof AgentTodoSummary>
  interactionFields: ReadonlyArray<keyof AgentInteractionSummary>
}

const CUSTOMER_SUMMARY_FIELDS = [
  'id',
  'name',
  'city',
  'budgetWan',
  'areaSqm',
  'propertyType',
  'household',
  'stage',
  'sourceChannel',
  'stylePreference',
  'needs',
  'notes',
  'nextFollowUpAt',
  'lastInteractionAt',
  'profileValues',
] as const satisfies ReadonlyArray<keyof AgentCustomerSummary>

const TODO_SUMMARY_FIELDS = [
  'id',
  'customerId',
  'title',
  'dueAt',
  'completed',
] as const satisfies ReadonlyArray<keyof AgentTodoSummary>

const INTERACTION_SUMMARY_FIELDS = [
  'id',
  'customerId',
  'channel',
  'summary',
  'happenedAt',
  'nextAction',
] as const satisfies ReadonlyArray<keyof AgentInteractionSummary>

export function createAgentContextSummary(
  customers: Customer[],
  todos: Todo[],
  now: string,
  interactions: Interaction[] = [],
  profileFields: ProfileFieldDefinition[] = DEFAULT_PROFILE_FIELD_DEFINITIONS,
): AgentSendableContextSummary {
  const normalizedProfileFields = normalizeProfileFieldDefinitions(profileFields).filter((field) => field.enabled)
  return {
    now,
    profileFields: normalizedProfileFields.map((field) => ({
      key: field.key,
      label: field.label,
      description: field.description,
      type: field.type,
      options: field.options,
      enabled: field.enabled,
      showInSummary: field.showInSummary,
      extractionHint: field.extractionHint,
    })),
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      city: customer.city,
      budgetWan: customer.budgetWan,
      areaSqm: customer.areaSqm,
      propertyType: customer.propertyType,
      household: customer.household,
      stage: customer.stage,
      sourceChannel: customer.sourceChannel ?? '',
      stylePreference: customer.stylePreference ?? '',
      needs: customer.needs,
      notes: customer.notes,
      nextFollowUpAt: customer.nextFollowUpAt,
      lastInteractionAt: customer.lastInteractionAt,
      profileValues: customer.profileValues,
    })),
    todos: todos.map((todo) => ({
      id: todo.id,
      customerId: todo.customerId,
      title: todo.title,
      dueAt: todo.dueAt,
      completed: todo.completed,
    })),
    interactions: interactions.map((interaction) => ({
      id: interaction.id,
      customerId: interaction.customerId,
      channel: interaction.channel,
      summary: interaction.summary,
      happenedAt: interaction.happenedAt,
      nextAction: interaction.nextAction,
    })),
  }
}

export function createModelDisclosure(summary: AgentSendableContextSummary): AgentModelDisclosure {
  return {
    provider: 'openai-compatible',
    customerCount: summary.customers.length,
    todoCount: summary.todos.length,
    interactionCount: summary.interactions.length,
    customerFields: CUSTOMER_SUMMARY_FIELDS,
    profileFieldKeys: summary.profileFields.map((field) => field.key),
    todoFields: TODO_SUMMARY_FIELDS,
    interactionFields: INTERACTION_SUMMARY_FIELDS,
  }
}
