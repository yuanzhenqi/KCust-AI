import { describe, expect, it, vi } from 'vitest'
import { cancelHoldToTalk, listenOnce, startHoldToTalk, stopHoldToTalk, type SpeechBridge } from './speech'

function createSpeechBridge(overrides: Partial<SpeechBridge> = {}): SpeechBridge {
  return {
    isAvailable: vi.fn().mockResolvedValue({ available: true }),
    requestPermission: vi.fn().mockResolvedValue({ status: 'granted' }),
    startListening: vi.fn().mockResolvedValue({ provider: 'iflytek' }),
    stopListening: vi.fn().mockResolvedValue({ text: '和无锡的张总明天晚上八点有个会，提醒我', provider: 'iflytek' }),
    cancelListening: vi.fn().mockResolvedValue({ cancelled: true }),
    listenOnce: vi.fn().mockResolvedValue({ text: '和无锡的张总明天晚上八点有个会，提醒我' }),
    ...overrides,
  }
}

describe('speech input bridge', () => {
  it('returns a clear text-input fallback outside Android', async () => {
    const bridge = createSpeechBridge()

    await expect(listenOnce({ bridge, platform: 'web' })).resolves.toEqual({
      status: 'unsupported',
      message: '语音输入需要 Android 麦克风权限；Web 预览请先使用文字输入',
    })
    expect(bridge.isAvailable).not.toHaveBeenCalled()
  })

  it('returns the recognized transcript on Android', async () => {
    const bridge = createSpeechBridge()

    await expect(listenOnce({ bridge, platform: 'android' })).resolves.toEqual({
      status: 'recognized',
      text: '和无锡的张总明天晚上八点有个会，提醒我',
      provider: 'system',
      message: '语音已转成文字，请确认后生成草稿',
    })
    expect(bridge.isAvailable).toHaveBeenCalledTimes(1)
    expect(bridge.requestPermission).toHaveBeenCalledTimes(1)
    expect(bridge.listenOnce).toHaveBeenCalledWith({ preferredProvider: 'iflytek' })
  })

  it('shows a clearer message when Android returns an iFlytek transcript', async () => {
    const bridge = createSpeechBridge({
      listenOnce: vi.fn().mockResolvedValue({
        text: '记录客户信息 客户微信名张总 工地位于武汉城市',
        provider: 'iflytek',
      }),
    })

    await expect(listenOnce({ bridge, platform: 'android' })).resolves.toEqual({
      status: 'recognized',
      text: '记录客户信息 客户微信名张总 工地位于武汉城市',
      provider: 'iflytek',
      message: '讯飞语音已转成文字，请确认后生成草稿',
    })
    expect(bridge.listenOnce).toHaveBeenCalledWith({ preferredProvider: 'iflytek' })
  })

  it('does not listen when speech recognition is unavailable or permission is denied', async () => {
    const unavailableBridge = createSpeechBridge({
      isAvailable: vi.fn().mockResolvedValue({ available: false }),
    })
    await expect(listenOnce({ bridge: unavailableBridge, platform: 'android' })).resolves.toMatchObject({
      status: 'unsupported',
    })
    expect(unavailableBridge.listenOnce).not.toHaveBeenCalled()

    const deniedBridge = createSpeechBridge({
      requestPermission: vi.fn().mockResolvedValue({ status: 'denied' }),
    })
    await expect(listenOnce({ bridge: deniedBridge, platform: 'android' })).resolves.toMatchObject({
      status: 'permission-denied',
    })
    expect(deniedBridge.listenOnce).not.toHaveBeenCalled()
  })

  it('handles an empty recognition result without running the assistant', async () => {
    const bridge = createSpeechBridge({
      listenOnce: vi.fn().mockResolvedValue({ text: '   ' }),
    })

    await expect(listenOnce({ bridge, platform: 'android' })).resolves.toEqual({
      status: 'empty',
      message: '没有识别到有效语音，请再说一次或改用文字输入',
    })
  })

  it('starts a hold-to-talk iFlytek recording after permission is granted', async () => {
    const bridge = createSpeechBridge()

    await expect(startHoldToTalk({ bridge, platform: 'android' })).resolves.toEqual({
      status: 'recording',
      provider: 'iflytek',
      message: '讯飞识别中，松开发送，上滑取消',
    })
    expect(bridge.startListening).toHaveBeenCalledWith({ preferredProvider: 'iflytek' })
  })

  it('stops hold-to-talk and returns the final transcript', async () => {
    const bridge = createSpeechBridge()

    await expect(stopHoldToTalk({ bridge, platform: 'android' })).resolves.toEqual({
      status: 'recognized',
      provider: 'iflytek',
      text: '和无锡的张总明天晚上八点有个会，提醒我',
      message: '讯飞语音已转成文字，请确认后生成草稿',
    })
  })

  it('cancels hold-to-talk without returning transcript text', async () => {
    const bridge = createSpeechBridge()

    await expect(cancelHoldToTalk({ bridge, platform: 'android' })).resolves.toEqual({
      status: 'cancelled',
      message: '已取消语音输入',
    })
    expect(bridge.cancelListening).toHaveBeenCalledTimes(1)
  })
})
