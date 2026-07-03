import type { Customer, Todo } from './types'
import { normalizeCustomerProfileFromNeeds } from './customerUpdateNormalization'

export function hydrateCustomers(seedCustomers: Customer[], storedCustomers: Customer[]): Customer[] {
  if (storedCustomers.length === 0) return seedCustomers.map(normalizeCustomerProfileFromNeeds)

  return hydrateById(seedCustomers, storedCustomers).map(normalizeCustomerProfileFromNeeds)
}

export function hydrateTodos(seedTodos: Todo[], storedTodos: Todo[]): Todo[] {
  if (storedTodos.length === 0) return seedTodos

  return hydrateById(seedTodos, storedTodos)
}

function hydrateById<T extends { id: string }>(seedValues: T[], storedValues: T[]): T[] {
  const seedIds = new Set(seedValues.map((value) => value.id))
  const storedById = new Map(storedValues.map((value) => [value.id, value]))
  const localOnly = storedValues.filter((value) => !seedIds.has(value.id))
  const seedBackfill = seedValues.map((value) => storedById.get(value.id) ?? value)

  return [...localOnly, ...seedBackfill]
}
