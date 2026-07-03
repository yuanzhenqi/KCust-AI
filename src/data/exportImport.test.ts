import { describe, expect, it } from 'vitest'
import { createLocalRepository, type KeyValueStorage } from './localRepository'
import { exportRepositorySnapshot, importRepositorySnapshot } from './exportImport'
import type { Customer, Todo } from '../domain/types'

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
  notes: '关注整体浴室',
  nextFollowUpAt: null,
  lastInteractionAt: '2026-05-27T10:30:00.000+08:00',
  createdAt: '2026-05-25T21:00:00.000+08:00',
  updatedAt: '2026-05-27T10:35:00.000+08:00',
  syncStatus: 'local',
}

const todo: Todo = {
  id: 'todo-1',
  customerId: 'c-zhang',
  title: '发送整体浴室案例',
  dueAt: '2026-05-28T09:30',
  completed: false,
}

describe('export/import local data', () => {
  it('exports a versioned repository snapshot as JSON', () => {
    const repository = createLocalRepository(new MemoryStorage())
    repository.saveCustomer(customer)
    repository.saveTodo(todo)

    const exported = JSON.parse(exportRepositorySnapshot(repository))

    expect(exported.version).toBe(1)
    expect(exported.customers).toEqual([customer])
    expect(exported.todos).toEqual([todo])
  })

  it('imports a valid repository snapshot into a fresh repository', () => {
    const source = createLocalRepository(new MemoryStorage())
    source.saveCustomer(customer)
    source.saveTodo(todo)

    const target = createLocalRepository(new MemoryStorage())
    const result = importRepositorySnapshot(exportRepositorySnapshot(source), target)

    expect(result).toEqual({ status: 'imported', customers: 1, todos: 1 })
    expect(target.listCustomers()).toEqual([customer])
    expect(target.listTodos()).toEqual([todo])
  })

  it('rejects invalid snapshot JSON without mutating the repository', () => {
    const target = createLocalRepository(new MemoryStorage())
    target.saveCustomer(customer)

    expect(importRepositorySnapshot('{bad json', target)).toEqual({ status: 'invalid', reason: 'invalid-json' })
    expect(importRepositorySnapshot(JSON.stringify({ version: 99 }), target)).toEqual({
      status: 'invalid',
      reason: 'unsupported-version',
    })
    expect(target.listCustomers()).toEqual([customer])
  })
})
