import { parseDevice, parseRegion } from './device'

describe('parseRegion', () => {
  it('空值与本地回环返回内网', () => {
    expect(parseRegion('')).toBe('内网')
    expect(parseRegion('127.0.0.1')).toBe('内网')
    expect(parseRegion('::1')).toBe('内网')
  })

  it('私网 IPv4 返回内网', () => {
    expect(parseRegion('192.168.0.1')).toBe('内网')
    expect(parseRegion('192.168.255.254')).toBe('内网')
    expect(parseRegion('10.0.0.1')).toBe('内网')
    expect(parseRegion('10.255.255.255')).toBe('内网')
  })
})

describe('parseDevice', () => {
  const CHROME_WIN =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  const EDGE_WIN = `${CHROME_WIN} Edg/120.0.0.0`
  const FIREFOX_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0'
  const CHROME_ANDROID =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
  const CHROME_LINUX =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  const IPHONE_SAFARI =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

  it('空 UA 返回 Unknown / Unknown', () => {
    expect(parseDevice('')).toBe('Unknown / Unknown')
  })

  it('识别 Edge 优先于 Chrome', () => {
    expect(parseDevice(EDGE_WIN)).toBe('Edge / Windows')
  })

  it('识别浏览器与桌面系统', () => {
    expect(parseDevice(CHROME_WIN)).toBe('Chrome / Windows')
    expect(parseDevice(FIREFOX_MAC)).toBe('Firefox / macOS')
    expect(parseDevice(CHROME_LINUX)).toBe('Chrome / Linux')
  })

  it('识别 Android 与 iOS 系统分支', () => {
    expect(parseDevice(CHROME_ANDROID)).toBe('Chrome / Android')
    expect(parseDevice('MyApp/1.0 (iPhone; iOS 17)')).toBe('Unknown / iOS')
  })

  it('iOS 真机 UA（含 like Mac OS X）不被 macOS 分支误判', () => {
    expect(parseDevice(IPHONE_SAFARI)).toBe('Safari / iOS')
  })
})
