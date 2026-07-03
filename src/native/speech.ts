import { Capacitor, registerPlugin } from '@capacitor/core'

export type SpeechPermissionStatus = 'granted' | 'denied'
export type SpeechProvider = 'iflytek' | 'system'

export type SpeechListenOptions = {
  preferredProvider?: SpeechProvider
}

export interface SpeechBridge {
  isAvailable(): Promise<{ available: boolean }>
  requestPermission(): Promise<{ status: SpeechPermissionStatus }>
  listenOnce(options?: SpeechListenOptions): Promise<{ text: string; provider?: SpeechProvider }>
  startListening?(options?: SpeechListenOptions): Promise<{ provider?: SpeechProvider }>
  stopListening?(): Promise<{ text: string; provider?: SpeechProvider }>
  cancelListening?(): Promise<{ cancelled: boolean }>
}

export type SpeechInputResult =
  | { status: 'recognized'; text: string; provider: SpeechProvider; message: string }
  | { status: 'recording'; provider: SpeechProvider; message: string }
  | { status: 'cancelled'; message: string }
  | { status: 'permission-denied'; message: string }
  | { status: 'unsupported'; message: string }
  | { status: 'empty'; message: string }

type SpeechOptions = {
  bridge?: SpeechBridge
  platform?: string
}

const NativeSpeech = registerPlugin<SpeechBridge>('Speech')

const WEB_FALLBACK_MESSAGE = '语音输入需要 Android 麦克风权限；Web 预览请先使用文字输入'
const PERMISSION_MESSAGE = '语音输入需要麦克风权限；请授权后再试'
const EMPTY_MESSAGE = '没有识别到有效语音，请再说一次或改用文字输入'
const IFLYTEK_DONE_MESSAGE = '讯飞语音已转成文字，请确认后生成草稿'
const SYSTEM_DONE_MESSAGE = '语音已转成文字，请确认后生成草稿'
const RECORDING_MESSAGE = '讯飞识别中，松开发送，上滑取消'
const CANCELLED_MESSAGE = '已取消语音输入'

export async function listenOnce({
  bridge = NativeSpeech,
  platform = Capacitor.getPlatform(),
}: SpeechOptions = {}): Promise<SpeechInputResult> {
  if (platform !== 'android') return { status: 'unsupported', message: WEB_FALLBACK_MESSAGE }

  try {
    const availability = await bridge.isAvailable()
    if (!availability.available) return { status: 'unsupported', message: '当前安卓设备不可用系统语音识别，请使用文字输入' }

    const permission = await bridge.requestPermission()
    if (permission.status !== 'granted') return { status: 'permission-denied', message: PERMISSION_MESSAGE }

    const recognition = await bridge.listenOnce({ preferredProvider: 'iflytek' })
    const transcript = recognition.text.trim()
    if (!transcript) return { status: 'empty', message: EMPTY_MESSAGE }

    const provider = recognition.provider ?? 'system'
    return {
      status: 'recognized',
      text: transcript,
      provider,
      message: provider === 'iflytek' ? IFLYTEK_DONE_MESSAGE : SYSTEM_DONE_MESSAGE,
    }
  } catch {
    return { status: 'unsupported', message: WEB_FALLBACK_MESSAGE }
  }
}

export async function startHoldToTalk({
  bridge = NativeSpeech,
  platform = Capacitor.getPlatform(),
}: SpeechOptions = {}): Promise<SpeechInputResult> {
  if (platform !== 'android') return { status: 'unsupported', message: WEB_FALLBACK_MESSAGE }

  try {
    const availability = await bridge.isAvailable()
    if (!availability.available) return { status: 'unsupported', message: '当前安卓设备不可用语音识别，请使用文字输入' }

    const permission = await bridge.requestPermission()
    if (permission.status !== 'granted') return { status: 'permission-denied', message: PERMISSION_MESSAGE }

    if (!bridge.startListening) return listenOnce({ bridge, platform })

    const result = await bridge.startListening({ preferredProvider: 'iflytek' })
    const provider = result.provider ?? 'iflytek'
    return {
      status: 'recording',
      provider,
      message: provider === 'iflytek' ? RECORDING_MESSAGE : '系统语音识别中',
    }
  } catch {
    return { status: 'unsupported', message: WEB_FALLBACK_MESSAGE }
  }
}

export async function stopHoldToTalk({
  bridge = NativeSpeech,
  platform = Capacitor.getPlatform(),
}: SpeechOptions = {}): Promise<SpeechInputResult> {
  if (platform !== 'android') return { status: 'unsupported', message: WEB_FALLBACK_MESSAGE }
  if (!bridge.stopListening) return { status: 'unsupported', message: WEB_FALLBACK_MESSAGE }

  try {
    const recognition = await bridge.stopListening()
    const transcript = recognition.text.trim()
    if (!transcript) return { status: 'empty', message: EMPTY_MESSAGE }

    const provider = recognition.provider ?? 'system'
    return {
      status: 'recognized',
      text: transcript,
      provider,
      message: provider === 'iflytek' ? IFLYTEK_DONE_MESSAGE : SYSTEM_DONE_MESSAGE,
    }
  } catch {
    return { status: 'unsupported', message: WEB_FALLBACK_MESSAGE }
  }
}

export async function cancelHoldToTalk({
  bridge = NativeSpeech,
  platform = Capacitor.getPlatform(),
}: SpeechOptions = {}): Promise<SpeechInputResult> {
  if (platform !== 'android') return { status: 'cancelled', message: CANCELLED_MESSAGE }

  try {
    await bridge.cancelListening?.()
    return { status: 'cancelled', message: CANCELLED_MESSAGE }
  } catch {
    return { status: 'cancelled', message: CANCELLED_MESSAGE }
  }
}
