import type { LocalSnapshot } from '../domain/types'
import type { LocalRepository } from './localRepository'
import { LOCAL_SCHEMA_VERSION, snapshotFromRepository } from './schema'

export type ImportSnapshotResult =
  | { status: 'imported'; customers: number; todos: number }
  | { status: 'invalid'; reason: 'invalid-json' | 'unsupported-version' | 'invalid-shape' }

export function exportRepositorySnapshot(repository: LocalRepository): string {
  return JSON.stringify(snapshotFromRepository(repository), null, 2)
}

export function importRepositorySnapshot(rawSnapshot: string, repository: LocalRepository): ImportSnapshotResult {
  const snapshot = parseSnapshot(rawSnapshot)
  if (!snapshot) return { status: 'invalid', reason: 'invalid-json' }
  if (snapshot.version !== LOCAL_SCHEMA_VERSION) return { status: 'invalid', reason: 'unsupported-version' }
  if (!isValidSnapshotShape(snapshot)) return { status: 'invalid', reason: 'invalid-shape' }

  snapshot.customers.forEach((customer) => repository.saveCustomer(customer))
  snapshot.todos.forEach((todo) => repository.saveTodo(todo))
  snapshot.profiles.forEach((profile) => repository.saveProfile(profile))
  snapshot.needTags.forEach((needTag) => repository.saveNeedTag(needTag))
  snapshot.interactions.forEach((interaction) => repository.saveInteraction(interaction))
  snapshot.reminders.forEach((reminder) => repository.saveReminder(reminder))
  snapshot.calendarEventLinks.forEach((calendarEventLink) => repository.saveCalendarEventLink(calendarEventLink))
  repository.saveAssistantHistory(snapshot.assistantHistory)
  repository.saveProfileFieldDefinitions(snapshot.profileFieldDefinitions)

  return { status: 'imported', customers: snapshot.customers.length, todos: snapshot.todos.length }
}

function parseSnapshot(rawSnapshot: string): Partial<LocalSnapshot> | null {
  try {
    const parsed = JSON.parse(rawSnapshot)
    return typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch {
    return null
  }
}

function isValidSnapshotShape(snapshot: Partial<LocalSnapshot>): snapshot is LocalSnapshot {
  return (
    Array.isArray(snapshot.customers) &&
    Array.isArray(snapshot.todos) &&
    Array.isArray(snapshot.profiles) &&
    Array.isArray(snapshot.needTags) &&
    Array.isArray(snapshot.interactions) &&
    Array.isArray(snapshot.reminders) &&
    Array.isArray(snapshot.calendarEventLinks) &&
    Array.isArray(snapshot.assistantHistory) &&
    Array.isArray(snapshot.profileFieldDefinitions)
  )
}
