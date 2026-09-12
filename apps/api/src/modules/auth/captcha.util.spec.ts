import { buildCaptcha } from './captcha.util'

const PREFIX = 'data:image/svg+xml;utf8,'
const CASES = 30

describe('buildCaptcha', () => {
  it('生成 4 位验证码且不含易混淆字符', () => {
    for (let i = 0; i < CASES; i++) {
      const { code } = buildCaptcha()
      expect(code).toHaveLength(4)
      expect(code).toMatch(/^[A-Z2-9]{4}$/)
      expect(code).not.toMatch(/[0O1I]/)
    }
  })

  it('返回 utf8 SVG dataURL', () => {
    const { image } = buildCaptcha()
    expect(image.startsWith(PREFIX)).toBe(true)
    const svg = decodeURIComponent(image.slice(PREFIX.length))
    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
    expect(svg).not.toContain('<script')
  })

  it('SVG 文本节点与验证码逐位一致', () => {
    for (let i = 0; i < CASES; i++) {
      const { code, image } = buildCaptcha()
      const svg = decodeURIComponent(image.slice(PREFIX.length))
      const rendered = [...svg.matchAll(/>([A-Z2-9])<\/text>/g)].map((m) => m[1]).join('')
      expect(rendered).toBe(code)
    }
  })
})
