import { Capacitor, registerPlugin } from '@capacitor/core'
import { defaultOverlayConfig, normalizeOverlayConfig, type OverlayConfig } from '../domain/overlayConfig'

export type OverlayPermissionStatus = 'granted' | 'denied' | 'unsupported'
export type OverlayStartStatus = 'started' | 'permission-denied' | 'unsupported'
export type OverlayStopStatus = 'stopped' | 'unsupported'
export type OverlayStatusUpdateStatus = 'updated' | 'unsupported'
export type OverlayTodoUpdateStatus = 'updated' | 'unsupported'
export type OverlayPendingAction =
  | 'foreground-voice-capture'
  | 'overlay-voice-start'
  | 'overlay-voice-stop'
  | 'overlay-voice-cancel'
  | 'overlay-confirm'
  | 'overlay-dismiss'

export interface OverlayBridge {
  checkPermission(): Promise<{ status: OverlayPermissionStatus }>
  requestPermission(): Promise<{ status: OverlayPermissionStatus }>
  start(options?: OverlayStartOptions): Promise<{ status: OverlayStartStatus }>
  stop(): Promise<{ status: OverlayStopStatus }>
  consumePendingCommand(): Promise<{ command: string; action?: OverlayPendingAction }>
  updateTodos(options: OverlayTodoUpdateOptions): Promise<{ status: OverlayTodoUpdateStatus }>
  updateStatus(options: OverlayStatusUpdateOptions): Promise<{ status: OverlayStatusUpdateStatus }>
}

export interface OverlayTodoSummary {
  id: string
  title: string
  dueAt: string | null
}

export interface OverlayStartOptions {
  mode: 'hold-to-talk'
  todos: OverlayTodoSummary[]
  config: OverlayConfig
}

export interface OverlayStatusUpdateOptions {
  message: string
  detail?: string
  requiresConfirmation?: boolean
  primaryActionLabel?: string
  secondaryActionLabel?: string
}

export interface OverlayTodoUpdateOptions {
  todos: OverlayTodoSummary[]
}

export type FloatingAssistantResult =
  | { status: 'started'; message: string }
  | { status: 'stopped'; message: string }
  | { status: 'permission-denied'; message: string }
  | { status: 'unsupported'; message: string }

type OverlayOptions = {
  bridge?: OverlayBridge
  platform?: string
  todos?: OverlayTodoSummary[]
  config?: OverlayConfig
  message?: string
  detail?: string
  requiresConfirmation?: boolean
  primaryActionLabel?: string
  secondaryActionLabel?: string
}

const NativeOverlay = registerPlugin<OverlayBridge>('Overlay')

const WEB_FALLBACK_MESSAGE = '系统悬浮球需要 Android 原生环境；Web 预览继续使用底部 AI 输入条'
const PERMISSION_MESSAGE = '请在安卓系统设置里允许“显示在其他应用上层”，当前先使用 app 内 AI 输入条'
const OVERLAY_ACTIONS: OverlayPendingAction[] = [
  'foreground-voice-capture',
  'overlay-voice-start',
  'overlay-voice-stop',
  'overlay-voice-cancel',
  'overlay-confirm',
  'overlay-dismiss',
]

export function isFloatingAssistantSupported(platform = Capacitor.getPlatform()): boolean {
  return platform === 'android'
}

export async function checkFloatingAssistantPermission({
  bridge = NativeOverlay,
  platform = Capacitor.getPlatform(),
}: OverlayOptions = {}): Promise<{ status: OverlayPermissionStatus }> {
  if (!isFloatingAssistantSupported(platform)) return { status: 'unsupported' }

  try {
    return await bridge.checkPermission()
  } catch {
    return { status: 'unsupported' }
  }
}

export async function requestFloatingAssistantPermission({
  bridge = NativeOverlay,
  platform = Capacitor.getPlatform(),
}: OverlayOptions = {}): Promise<{ status: OverlayPermissionStatus }> {
  if (!isFloatingAssistantSupported(platform)) return { status: 'unsupported' }

  try {
    return await bridge.requestPermission()
  } catch {
    return { status: 'unsupported' }
  }
}

export async function startFloatingAssistant({
  bridge = NativeOverlay,
  platform = Capacitor.getPlatform(),
  todos = [],
  config = defaultOverlayConfig,
}: OverlayOptions = {}): Promise<FloatingAssistantResult> {
  if (!isFloatingAssistantSupported(platform)) {
    return { status: 'unsupported', message: WEB_FALLBACK_MESSAGE }
  }

  const currentPermission = await checkFloatingAssistantPermission({ bridge, platform })
  if (currentPermission.status !== 'granted') {
    const requestedPermission = await requestFloatingAssistantPermission({ bridge, platform })
    if (requestedPermission.status !== 'granted') {
      return { status: 'permission-denied', message: PERMISSION_MESSAGE }
    }
  }

  try {
    const result = await bridge.start({
      mode: 'hold-to-talk',
      todos: todos ?? [],
      config: normalizeOverlayConfig(config),
    })
    if (result.status === 'started') {
      return { status: 'started', message: '系统悬浮球已开启，可从其他安卓界面呼出 AI 助手' }
    }
    if (result.status === 'permission-denied') return { status: 'permission-denied', message: PERMISSION_MESSAGE }
    return { status: 'unsupported', message: WEB_FALLBACK_MESSAGE }
  } catch {
    return { status: 'unsupported', message: WEB_FALLBACK_MESSAGE }
  }
}

export async function stopFloatingAssistant({
  bridge = NativeOverlay,
  platform = Capacitor.getPlatform(),
}: OverlayOptions = {}): Promise<FloatingAssistantResult> {
  if (!isFloatingAssistantSupported(platform)) {
    return { status: 'unsupported', message: WEB_FALLBACK_MESSAGE }
  }

  try {
    const result = await bridge.stop()
    if (result.status === 'stopped') {
      return { status: 'stopped', message: '系统悬浮球已关闭，仍可使用 app 内底部 AI 输入条' }
    }
    return { status: 'unsupported', message: WEB_FALLBACK_MESSAGE }
  } catch {
    return { status: 'unsupported', message: WEB_FALLBACK_MESSAGE }
  }
}

export async function consumeFloatingAssistantCommand({
  bridge = NativeOverlay,
  platform = Capacitor.getPlatform(),
}: OverlayOptions = {}): Promise<{ command: string; action?: OverlayPendingAction }> {
  if (!isFloatingAssistantSupported(platform)) return { command: '', action: undefined }

  try {
    const result = await bridge.consumePendingCommand()
    return {
      command: result.command.trim(),
      action: OVERLAY_ACTIONS.includes(result.action as OverlayPendingAction)
        ? result.action as OverlayPendingAction
        : undefined,
    }
  } catch {
    return { command: '', action: undefined }
  }
}

export async function syncFloatingAssistantTodos({
  bridge = NativeOverlay,
  platform = Capacitor.getPlatform(),
  todos = [],
}: OverlayOptions = {}): Promise<{ status: OverlayTodoUpdateStatus }> {
  if (!isFloatingAssistantSupported(platform)) return { status: 'unsupported' }

  try {
    return await bridge.updateTodos({ todos: todos ?? [] })
  } catch {
    return { status: 'unsupported' }
  }
}

export async function updateFloatingAssistantStatus({
  bridge = NativeOverlay,
  platform = Capacitor.getPlatform(),
  message = '',
  detail = '',
  requiresConfirmation = false,
  primaryActionLabel = '',
  secondaryActionLabel = '',
}: OverlayOptions = {}): Promise<{ status: OverlayStatusUpdateStatus }> {
  if (!isFloatingAssistantSupported(platform) || !message.trim()) return { status: 'unsupported' }

  try {
    return await bridge.updateStatus({
      message: message.trim(),
      detail: detail.trim(),
      ...(requiresConfirmation ? { requiresConfirmation } : {}),
      ...(primaryActionLabel.trim() ? { primaryActionLabel: primaryActionLabel.trim() } : {}),
      ...(secondaryActionLabel.trim() ? { secondaryActionLabel: secondaryActionLabel.trim() } : {}),
    })
  } catch {
    return { status: 'unsupported' }
  }
}
