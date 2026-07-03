import type { AssistantCommand } from './aiInterpreter'
import { filterCustomersByCity, summarizeCustomers } from './customerLogic'
import type { Customer, Todo } from './types'

export interface AgentGuardrailContext {
  customers: Customer[]
  todos: Todo[]
}

export interface GuardedCommandResult {
  command: AssistantCommand
  toolTrace: string[]
}

export function applyModelCommandGuardrails(
  command: AssistantCommand,
  context: AgentGuardrailContext,
): GuardedCommandResult {
  void context.todos

  if (command.kind === 'query-customers') {
    const matches =
      command.payload.city === '全部'
        ? context.customers
        : filterCustomersByCity(context.customers, command.payload.city)

    return {
      command: {
        ...command,
        title: '本地客户查询结果',
        payload: {
          ...command.payload,
          resultSummary: summarizeCustomers(matches),
        },
      },
      toolTrace: ['local:ground-query'],
    }
  }

  if (command.kind === 'update-customer') {
    if (command.payload.customerId) {
      const customer = findCustomerById(context.customers, command.payload.customerId)
      if (!customer) return blockMissingCustomer()

      return {
        command: {
          ...command,
          payload: {
            ...command.payload,
            customerName: customer.name,
            city: customer.city,
          },
        },
        toolTrace: ['local:normalize-customer'],
      }
    }

    if (command.payload.customerId !== null) {
      return blockMissingCustomer()
    }

    if (command.payload.customerId === null) {
      const matches = command.payload.city
        ? filterCustomersByCity(context.customers, command.payload.city)
        : context.customers

      if (matches.length > 1) {
        return {
          command: {
            kind: 'agent-answer',
            requiresConfirmation: false,
            title: '需要确认客户',
            payload: {
              message: `我找到了 ${matches.length} 位${command.payload.city || ''}客户：${matches
                .map((customer) => customer.name)
                .join('、')}。请补充客户姓名后我再生成修改草稿。`,
              toolTrace: ['客户匹配', '歧义检查'],
            },
          },
          toolTrace: ['local:clarify-customer'],
        }
      }
    }
  }

  if (command.kind === 'create-reminder') {
    if (command.payload.customerId && !findCustomerById(context.customers, command.payload.customerId)) {
      return blockMissingCustomer()
    }

    if (command.payload.customerId !== null && !command.payload.customerId) return blockMissingCustomer()
  }

  if (command.kind === 'create-interaction') {
    if (command.payload.customerId) {
      const customer = findCustomerById(context.customers, command.payload.customerId)
      if (!customer) return blockMissingCustomer()

      return {
        command: {
          ...command,
          payload: {
            ...command.payload,
            customerName: customer.name,
          },
        },
        toolTrace: ['local:normalize-customer'],
      }
    }

    if (command.payload.customerId !== null) return blockMissingCustomer()
  }

  return { command, toolTrace: [] }
}

function findCustomerById(customers: Customer[], customerId: string): Customer | undefined {
  return customers.find((customer) => customer.id === customerId)
}

function blockMissingCustomer(): GuardedCommandResult {
  return {
    command: {
      kind: 'unknown',
      requiresConfirmation: false,
      title: '模型响应未执行',
      payload: { message: '模型匹配的客户不存在，已阻止执行。请重新指定客户。' },
    },
    toolTrace: ['local:block-missing-customer'],
  }
}
