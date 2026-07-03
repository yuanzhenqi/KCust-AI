import { describe, expect, it } from 'vitest'
import { scheduleTodoReminder, type NotificationBridge } from './reminders'
import type { CalendarBridge } from './calendar'
import type { Todo } from '../domain/types'

const todo: Todo = {
  id: 'todo-zhang-meeting',
  customerId: 'c-zhang',
  title: '准备张总方案会议',
  dueAt: '2026-05-26T20:00:00.000+08:00',
  completed: false,
}

describe('native reminder scheduling', () => {
  it('schedules a local notification when display permission is granted', async () => {
    const scheduled: unknown[] = []
    const bridge: NotificationBridge = {
      checkPermissions: async () => ({ display: 'granted' }),
      requestPermissions: async () => ({ display: 'granted' }),
      schedule: async (options) => {
        scheduled.push(options)
        return { notifications: options.notifications.map((notification) => ({ id: notification.id })) }
      },
    }

    const result = await scheduleTodoReminder({
      todo,
      customerName: '张总',
      now: '2026-05-25T21:00:00.000+08:00',
      bridge,
    })

    expect(result.status).toBe('scheduled')
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0]).toMatchObject({
      notifications: [
        {
          title: '准备张总方案会议',
          body: '张总 · KCUST AI 客户提醒',
          extra: { todoId: 'todo-zhang-meeting', customerId: 'c-zhang' },
        },
      ],
    })
  })

  it('requests permission when display state is prompt before scheduling', async () => {
    let requested = false
    const bridge: NotificationBridge = {
      checkPermissions: async () => ({ display: 'prompt' }),
      requestPermissions: async () => {
        requested = true
        return { display: 'granted' }
      },
      schedule: async (options) => ({ notifications: options.notifications.map((notification) => ({ id: notification.id })) }),
    }

    const result = await scheduleTodoReminder({
      todo,
      now: '2026-05-25T21:00:00.000+08:00',
      bridge,
    })

    expect(requested).toBe(true)
    expect(result.status).toBe('scheduled')
  })

  it('keeps the reminder app-only when permission is denied or no due time exists', async () => {
    const bridge: NotificationBridge = {
      checkPermissions: async () => ({ display: 'denied' }),
      requestPermissions: async () => ({ display: 'denied' }),
      schedule: async () => {
        throw new Error('should not schedule')
      },
    }

    await expect(
      scheduleTodoReminder({
        todo,
        now: '2026-05-25T21:00:00.000+08:00',
        bridge,
      }),
    ).resolves.toMatchObject({ status: 'app-only', reason: 'permission-denied' })

    await expect(
      scheduleTodoReminder({
        todo: { ...todo, dueAt: null },
        now: '2026-05-25T21:00:00.000+08:00',
        bridge,
      }),
    ).resolves.toMatchObject({ status: 'app-only', reason: 'missing-time' })
  })

  it('includes a linked Android calendar event when notification and calendar scheduling both succeed', async () => {
    const bridge: NotificationBridge = {
      checkPermissions: async () => ({ display: 'granted' }),
      requestPermissions: async () => ({ display: 'granted' }),
      schedule: async (options) => ({ notifications: options.notifications.map((notification) => ({ id: notification.id })) }),
    }
    const calendarBridge: CalendarBridge = {
      checkPermissions: async () => ({ read: 'granted', write: 'granted' }),
      requestPermissions: async () => ({ read: 'granted', write: 'granted' }),
      listCalendars: async () => ({ calendars: [] }),
      createEvent: async () => ({ eventId: 'event-zhang', calendarId: 'primary' }),
    }

    await expect(
      scheduleTodoReminder({
        todo,
        customerName: '张总',
        now: '2026-05-25T21:00:00.000+08:00',
        bridge,
        calendarBridge,
        calendarPlatform: 'android',
      }),
    ).resolves.toMatchObject({
      status: 'scheduled',
      calendarEvent: { status: 'linked', providerEventId: 'event-zhang', calendarId: 'primary' },
    })
  })

  it('keeps the app notification when calendar permission is denied or calendar write fails', async () => {
    const bridge: NotificationBridge = {
      checkPermissions: async () => ({ display: 'granted' }),
      requestPermissions: async () => ({ display: 'granted' }),
      schedule: async (options) => ({ notifications: options.notifications.map((notification) => ({ id: notification.id })) }),
    }
    const deniedCalendarBridge: CalendarBridge = {
      checkPermissions: async () => ({ read: 'denied', write: 'denied' }),
      requestPermissions: async () => ({ read: 'denied', write: 'denied' }),
      listCalendars: async () => ({ calendars: [] }),
      createEvent: async () => {
        throw new Error('should not write without permission')
      },
    }
    const failingCalendarBridge: CalendarBridge = {
      checkPermissions: async () => ({ read: 'granted', write: 'granted' }),
      requestPermissions: async () => ({ read: 'granted', write: 'granted' }),
      listCalendars: async () => ({ calendars: [] }),
      createEvent: async () => {
        throw new Error('calendar write failed')
      },
    }

    await expect(
      scheduleTodoReminder({
        todo,
        now: '2026-05-25T21:00:00.000+08:00',
        bridge,
        calendarBridge: deniedCalendarBridge,
        calendarPlatform: 'android',
      }),
    ).resolves.toMatchObject({
      status: 'scheduled',
      calendarEvent: { status: 'failed', failureReason: 'permission-denied' },
    })

    await expect(
      scheduleTodoReminder({
        todo,
        now: '2026-05-25T21:00:00.000+08:00',
        bridge,
        calendarBridge: failingCalendarBridge,
        calendarPlatform: 'android',
      }),
    ).resolves.toMatchObject({
      status: 'scheduled',
      calendarEvent: { status: 'failed', failureReason: 'native-unavailable' },
    })
  })
})
