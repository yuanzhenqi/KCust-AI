import type { Customer, Interaction } from './types'

export function createInteractionRecord(
  customer: Customer,
  input: {
    channel: Interaction['channel']
    summary: string
    happenedAt: string
    nextAction: string
    now: string
  },
): { customer: Customer; interaction: Interaction } {
  const summary = input.summary.trim()
  const happenedAt = input.happenedAt || input.now

  const interaction: Interaction = {
    id: `interaction-${customer.id}-${slugTime(happenedAt)}`,
    customerId: customer.id,
    channel: input.channel,
    summary,
    happenedAt,
    nextAction: input.nextAction.trim(),
    createdAt: input.now,
  }

  return {
    interaction,
    customer: {
      ...customer,
      notes: summary || customer.notes,
      lastInteractionAt: happenedAt,
      updatedAt: input.now,
    },
  }
}

export function sortInteractionsForTimeline(interactions: Interaction[]): Interaction[] {
  return [...interactions].sort((left, right) => new Date(right.happenedAt).getTime() - new Date(left.happenedAt).getTime())
}

function slugTime(value: string): string {
  return value.replace(/[^\dA-Za-z]+/g, '-').replace(/^-|-$/g, '')
}
