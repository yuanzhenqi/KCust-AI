import { describe, expect, it } from 'vitest'
import { getNativeCapabilityMatrix } from './capabilities'

describe('native capability matrix', () => {
  it('marks Android-only capabilities as requiring permission or native plugin work', () => {
    const capabilities = getNativeCapabilityMatrix()

    expect(capabilities.find((item) => item.id === 'overlay')?.androidStatus).toBe('requires-permission')
    expect(capabilities.find((item) => item.id === 'calendar')?.fallback).toBe('保留 app 内提醒')
    expect(capabilities.find((item) => item.id === 'keystore')?.webStatus).toBe('preview-only')
  })
})
