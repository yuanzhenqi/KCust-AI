import { describe, expect, it } from 'vitest'
import { hydrateCustomers, hydrateTodos } from './appState'
import type { Customer, Todo } from './types'

const seedCustomer: Customer = {
  id: 'c-seed',
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
  createdAt: '2026-05-20T09:00:00.000+08:00',
  updatedAt: '2026-05-24T09:00:00.000+08:00',
  syncStatus: 'local',
}

const seedTodo: Todo = {
  id: 'todo-seed',
  customerId: 'c-seed',
  title: '准备方案会议',
  dueAt: '2026-05-25T18:00:00.000+08:00',
  completed: false,
}

describe('app state hydration', () => {
  it('merges local saved customers with starter customers without duplicating ids', () => {
    const localCustomer: Customer = {
      ...seedCustomer,
      id: 'c-local',
      name: '未命名客户',
      city: '无锡',
      stage: '线索',
    }

    const customers = hydrateCustomers([seedCustomer], [localCustomer, { ...seedCustomer, name: '张总本地版本' }])

    expect(customers.map((customer) => customer.id)).toEqual(['c-local', 'c-seed'])
    expect(customers.find((customer) => customer.id === 'c-seed')?.name).toBe('张总本地版本')
  })

  it('hydrates structured profile fields from older need tags', () => {
    const storedCustomer: Customer = {
      ...seedCustomer,
      budgetWan: null,
      household: '',
      needs: ['智能家居', '预算调整为50万', '家庭结构：4 人住'],
    }

    const customers = hydrateCustomers([seedCustomer], [storedCustomer])

    expect(customers[0]).toMatchObject({
      budgetWan: 50,
      household: '4 人住',
      needs: ['智能家居'],
    })
  })

  it('merges local saved todos with starter todos without losing seed reminders', () => {
    const localTodo: Todo = {
      id: 'todo-local',
      customerId: 'c-seed',
      title: '确认智能清单',
      dueAt: '2026-05-28T09:30:00.000+08:00',
      completed: false,
    }

    const todos = hydrateTodos([seedTodo], [localTodo, { ...seedTodo, completed: true }])

    expect(todos.map((todo) => todo.id)).toEqual(['todo-local', 'todo-seed'])
    expect(todos.find((todo) => todo.id === 'todo-seed')?.completed).toBe(true)
  })
})
