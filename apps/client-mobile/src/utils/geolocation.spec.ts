import { afterEach, describe, expect, it } from 'vitest'
import { getPosition } from './geolocation'

type Outcome = { ok: true; lat: number; lng: number } | { ok: false; code: number }

/** 按顺序依次给出每次 getCurrentPosition 的结果，并记录调用参数 */
function stubGeolocation(outcomes: Outcome[]): PositionOptions[] {
  const calls: PositionOptions[] = []
  const geolocation = {
    getCurrentPosition: (
      success: PositionCallback,
      error: PositionErrorCallback,
      options?: PositionOptions,
    ) => {
      calls.push(options ?? {})
      const outcome = outcomes.shift()
      if (!outcome) throw new Error('unexpected extra geolocation call')
      if (outcome.ok) {
        success({ coords: { latitude: outcome.lat, longitude: outcome.lng } } as GeolocationPosition)
      } else {
        error({ code: outcome.code } as GeolocationPositionError)
      }
    },
  }
  Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true })
  return calls
}

describe('定位封装', () => {
  afterEach(() => Reflect.deleteProperty(navigator, 'geolocation'))

  it('高精度超时后降级为低精度重试并返回坐标', async () => {
    const calls = stubGeolocation([{ ok: false, code: 3 }, { ok: true, lat: 31.2, lng: 121.4 }])
    await expect(getPosition()).resolves.toEqual({ lat: 31.2, lng: 121.4 })
    expect(calls).toHaveLength(2)
    expect(calls[0].enableHighAccuracy).toBe(true)
    expect(calls[1].enableHighAccuracy).toBe(false)
  })

  it('权限被拒绝时不重试，直接提示权限问题', async () => {
    const calls = stubGeolocation([{ ok: false, code: 1 }])
    await expect(getPosition()).rejects.toThrow('浏览器拒绝了定位授权')
    expect(calls).toHaveLength(1)
  })

  it('定位服务不可用时不误报权限问题，提示开启设备定位服务', async () => {
    stubGeolocation([{ ok: false, code: 2 }, { ok: false, code: 2 }])
    await expect(getPosition()).rejects.toThrow('请确认设备定位服务已开启')
  })

  it('非安全环境（http + 非 localhost）提前提示改用 https/localhost，不误报浏览器权限设置', async () => {
    const original = window.isSecureContext
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    try {
      const calls = stubGeolocation([{ ok: true, lat: 1, lng: 2 }])
      await expect(getPosition()).rejects.toThrow('不是安全环境')
      expect(calls).toHaveLength(0)
    } finally {
      Object.defineProperty(window, 'isSecureContext', { value: original, configurable: true })
    }
  })
})
