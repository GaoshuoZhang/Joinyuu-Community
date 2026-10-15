import { normalizeMobileUrl } from './mobile-url'

describe('global mobile URL', () => {
  it.each(['localhost:7759', '192.168.31.101:7759', 'https://mobile.example.com/community/', 'http://localhost:7759/'])('accepts usable entry addresses: %s', (url) => {
    expect(normalizeMobileUrl(` ${url} `)).toBe(url)
  })
  it.each([null, 123, {}, [], '', 'javascript:alert(1)', '//evil.example', '/mobile', 'ftp://example.com', 'https://u:p@example.com', 'https://example.com/#home', 'https://example.com/?themePreview=token', 'https://example.com/with space', 'http://example.com:99999'])('rejects unsafe or ambiguous addresses: %s', (url) => {
    expect(() => normalizeMobileUrl(url)).toThrow('移动端访问地址')
  })
})
