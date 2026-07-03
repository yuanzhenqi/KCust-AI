import { LocalNotifications } from '@capacitor/local-notifications'
import type { Todo } from '../domain/types'
import { createCalendarEvent, type CalendarBridge, type CalendarEventResult } from './calendar'

type DisplayPermission = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'

export interface NotificationBridge {
  checkPermissions(): Promise<{ display: DisplayPermission }>
  requestPermissions(): Promise<{ display: DisplayPermission }>
  schedule(options: {
    notifications: Array<{
      id: number
      title: string
      body: string
      schedule?: { at: Date; allowWhileIdle?: boolean }
      extra?: Record<string, string | null>
    }>
  }): Promise<{ notifications: Array<{ id: number }> }>
}

export type ReminderScheduleResult =
  | { status: 'scheduled'; notificationId: number; calendarEvent?: CalendarEventResult }
  | { status: 'app-only'; reason: 'missing-time' | 'past-time' | 'permission-denied' | 'native-unavailable' }

export async function scheduleTodoReminder({
  todo,
  customerName,
  now,
  bridge = LocalNotifications,
  calendarBridge,
  calendarPlatform,
}: {
  todo: Todo
  customerName?: string
  now: string
  bridge?: NotificationBridge
  calendarBridge?: CalendarBridge
  calendarPlatform?: string
}): Promise<ReminderScheduleResult> {
  if (!todo.dueAt) return { status: 'app-only', reason: 'missing-time' }

  const scheduledAt = new Date(todo.dueAt)
  if (scheduledAt.getTime() <= new Date(now).getTime()) return { status: 'app-only', reason: 'past-time' }

  try {
    const permission = await ensureDisplayPermission(bridge)
    if (permission !== 'granted') return { status: 'app-only', reason: 'permission-denied' }

    const notificationId = notificationIdFromTodo(todo.id)
    await bridge.schedule({
      notifications: [
        {
          id: notificationId,
          title: todo.title,
          body: `${customerName || '未关联客户'} · KCUST AI 客户提醒`,
          schedule: { at: scheduledAt, allowWhileIdle: true },
          extra: { todoId: todo.id, customerId: todo.customerId },
        },
      ],
    })

    const calendarEvent = await createCalendarEvent({
      title: todo.title,
      startAt: todo.dueAt,
      notes: `${customerName || '未关联客户'} · KCUST AI 客户提醒`,
      bridge: calendarBridge,
      platform: calendarPlatform,
    })

    return { status: 'scheduled', notificationId, calendarEvent }
  } catch {
    return { status: 'app-only', reason: 'native-unavailable' }
  }
}

async function ensureDisplayPermission(bridge: NotificationBridge): Promise<DisplayPermission> {
  const current = await bridge.checkPermissions()
  if (current.display === 'prompt' || current.display === 'prompt-with-rationale') {
    return (await bridge.requestPermissions()).display
  }
  return current.display
}

function notificationIdFromTodo(todoId: string): number {
  let hash = 0
  for (const char of todoId) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0
  }
  return Math.abs(hash) || 1
}
