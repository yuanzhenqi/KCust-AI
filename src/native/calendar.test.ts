import { describe, expect, it, vi } from 'vitest'
import { createCalendarEvent, listCalendars, requestCalendarPermission, type CalendarBridge } from './calendar'

function createBridge(overrides: Partial<CalendarBridge> = {}): CalendarBridge {
  return {
    checkPermissions: vi.fn().mockResolvedValue({ read: 'granted', write: 'granted' }),
    requestPermissions: vi.fn().mockResolvedValue({ read: 'granted', write: 'granted' }),
    listCalendars: vi.fn().mockResolvedValue({ calendars: [{ id: 'primary', name: '个人日历', isPrimary: true }] }),
    createEvent: vi.fn().mockResolvedValue({ eventId: 'event-42', calendarId: 'primary' }),
    ...overrides,
  }
}

describe('calendar bridge', () => {
  it('uses a preview fallback outside Android', async () => {
    const bridge = createBridge()

    await expect(
      createCalendarEvent({
        title: '张总方案会议',
        startAt: '2026-05-26T20:00:00.000+08:00',
        bridge,
        platform: 'web',
      }),
    ).resolves.toEqual({ status: 'failed', failureReason: 'native-unavailable' })
    expect(bridge.createEvent).not.toHaveBeenCalled()
  })

  it('requests permission before creating an Android calendar event', async () => {
    const bridge = createBridge({
      checkPermissions: vi.fn().mockResolvedValue({ read: 'denied', write: 'denied' }),
      requestPermissions: vi.fn().mockResolvedValue({ read: 'granted', write: 'granted' }),
    })

    await expect(
      createCalendarEvent({
        title: '张总方案会议',
        startAt: '2026-05-26T20:00:00.000+08:00',
        notes: 'KCUST AI 客户提醒',
        bridge,
        platform: 'android',
      }),
    ).resolves.toEqual({ status: 'linked', providerEventId: 'event-42', calendarId: 'primary' })

    expect(bridge.requestPermissions).toHaveBeenCalledTimes(1)
    expect(bridge.createEvent).toHaveBeenCalledWith({
      title: '张总方案会议',
      startAt: '2026-05-26T20:00:00.000+08:00',
      endAt: '2026-05-26T21:00:00.000+08:00',
      notes: 'KCUST AI 客户提醒',
      calendarId: undefined,
    })
  })

  it('normalizes datetime-local values before sending them to Android Calendar Provider', async () => {
    const bridge = createBridge()

    await createCalendarEvent({
      title: '张总方案会议',
      startAt: '2026-05-28T09:30',
      bridge,
      platform: 'android',
    })

    expect(bridge.createEvent).toHaveBeenCalledWith({
      title: '张总方案会议',
      startAt: '2026-05-28T09:30:00.000+08:00',
      endAt: '2026-05-28T10:30:00.000+08:00',
      notes: undefined,
      calendarId: undefined,
    })
  })

  it('reports permission denied and native failures without throwing', async () => {
    const deniedBridge = createBridge({
      checkPermissions: vi.fn().mockResolvedValue({ read: 'denied', write: 'denied' }),
      requestPermissions: vi.fn().mockResolvedValue({ read: 'denied', write: 'denied' }),
    })
    await expect(
      createCalendarEvent({
        title: '张总方案会议',
        startAt: '2026-05-26T20:00:00.000+08:00',
        bridge: deniedBridge,
        platform: 'android',
      }),
    ).resolves.toEqual({ status: 'failed', failureReason: 'permission-denied' })

    const failingBridge = createBridge({
      createEvent: vi.fn().mockRejectedValue(new Error('calendar unavailable')),
    })
    await expect(
      createCalendarEvent({
        title: '张总方案会议',
        startAt: '2026-05-26T20:00:00.000+08:00',
        bridge: failingBridge,
        platform: 'android',
      }),
    ).resolves.toEqual({ status: 'failed', failureReason: 'native-unavailable' })
  })

  it('lists calendars and requests permissions through the bridge on Android', async () => {
    const bridge = createBridge()

    await expect(listCalendars({ bridge, platform: 'android' })).resolves.toEqual({
      calendars: [{ id: 'primary', name: '个人日历', isPrimary: true }],
    })
    await expect(requestCalendarPermission({ bridge, platform: 'android' })).resolves.toEqual({
      read: 'granted',
      write: 'granted',
    })
  })
})
