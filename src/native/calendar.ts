import { Capacitor, registerPlugin } from '@capacitor/core'

export type CalendarPermissionStatus = 'granted' | 'denied'

export interface CalendarSummary {
  id: string
  name: string
  isPrimary: boolean
}

export interface CalendarBridge {
  checkPermissions(): Promise<{ read: CalendarPermissionStatus; write: CalendarPermissionStatus }>
  requestPermissions(): Promise<{ read: CalendarPermissionStatus; write: CalendarPermissionStatus }>
  listCalendars(): Promise<{ calendars: CalendarSummary[] }>
  createEvent(options: {
    title: string
    startAt: string
    endAt: string
    notes?: string
    calendarId?: string
  }): Promise<{ eventId: string; calendarId: string }>
}

export type CalendarEventResult =
  | { status: 'linked'; providerEventId: string; calendarId: string }
  | { status: 'failed'; failureReason: 'permission-denied' | 'native-unavailable' }

type CalendarOptions = {
  bridge?: CalendarBridge
  platform?: string
}

type CreateCalendarEventInput = CalendarOptions & {
  title: string
  startAt: string
  endAt?: string
  notes?: string
  calendarId?: string
}

const NativeCalendar = registerPlugin<CalendarBridge>('Calendar')

export async function requestCalendarPermission({
  bridge = NativeCalendar,
  platform = Capacitor.getPlatform(),
}: CalendarOptions = {}): Promise<{ read: CalendarPermissionStatus; write: CalendarPermissionStatus }> {
  if (platform !== 'android') return { read: 'denied', write: 'denied' }

  try {
    return await bridge.requestPermissions()
  } catch {
    return { read: 'denied', write: 'denied' }
  }
}

export async function listCalendars({
  bridge = NativeCalendar,
  platform = Capacitor.getPlatform(),
}: CalendarOptions = {}): Promise<{ calendars: CalendarSummary[] }> {
  if (platform !== 'android') return { calendars: [] }

  try {
    return await bridge.listCalendars()
  } catch {
    return { calendars: [] }
  }
}

export async function createCalendarEvent({
  title,
  startAt,
  endAt,
  notes,
  calendarId,
  bridge = NativeCalendar,
  platform = Capacitor.getPlatform(),
}: CreateCalendarEventInput): Promise<CalendarEventResult> {
  if (platform !== 'android') return { status: 'failed', failureReason: 'native-unavailable' }

  try {
    const normalizedStartAt = normalizeDateTime(startAt)
    const normalizedEndAt = normalizeDateTime(endAt ?? oneHourAfter(normalizedStartAt))
    const current = await bridge.checkPermissions()
    const permission = current.write === 'granted' ? current : await bridge.requestPermissions()
    if (permission.write !== 'granted') return { status: 'failed', failureReason: 'permission-denied' }

    const result = await bridge.createEvent({ title, startAt: normalizedStartAt, endAt: normalizedEndAt, notes, calendarId })
    return { status: 'linked', providerEventId: result.eventId, calendarId: result.calendarId }
  } catch {
    return { status: 'failed', failureReason: 'native-unavailable' }
  }
}

function normalizeDateTime(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return `${value}:00.000+08:00`
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) return `${value}.000+08:00`
  return value
}

function oneHourAfter(startAt: string): string {
  const date = new Date(startAt)
  const next = new Date(date.getTime() + 60 * 60 * 1000)
  const offset = startAt.match(/([+-]\d{2}:\d{2})$/)?.[1]
  if (!offset) return next.toISOString()

  const sign = offset.startsWith('-') ? -1 : 1
  const [hours, minutes] = offset.slice(1).split(':').map(Number)
  const offsetMinutes = sign * (hours * 60 + minutes)
  const local = new Date(next.getTime() + offsetMinutes * 60 * 1000)
  return [
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}.000${offset}`,
  ].join('')
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
