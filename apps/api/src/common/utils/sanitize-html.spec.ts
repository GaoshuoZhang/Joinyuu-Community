import { sanitizeHtml } from './sanitize-html'

describe('sanitizeHtml', () => {
  it('保留白名单标签与安全属性', () => {
    const out = sanitizeHtml(
      '<p>你好 <a href="https://example.com/a" target="_blank">链接</a></p><img src="https://example.com/a.png" alt="图">',
    )
    expect(out).toContain('<p>')
    expect(out).toContain('链接')
    expect(out).toContain('href="https://example.com/a"')
    expect(out).toContain('<img')
    expect(out).toContain('src="https://example.com/a.png"')
    expect(out).toContain('alt="图"')
  })

  it('script/style/iframe 连内容整体剔除', () => {
    const out = sanitizeHtml(
      '<p>前</p><script>alert(1)</script><style>p{color:red}</style><iframe src="https://x.test"></iframe><p>后</p>',
    )
    expect(out).toBe('<p>前</p><p>后</p>')
    expect(out).not.toContain('alert')
    expect(out).not.toContain('color:red')
    expect(out).not.toContain('iframe')
  })

  it('斜杠分隔属性绕过被解析并清除 onerror', () => {
    const out = sanitizeHtml('<img/src=x onerror=alert(1)>')
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('alert')
    expect(out).toContain('<img')
  })

  it('javascript: 协议被剔除', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">a</a>')
    expect(out).not.toContain('javascript')
    expect(out).not.toContain('href')
  })

  it('实体编码的 javascript: 协议被剔除', () => {
    const out = sanitizeHtml('<a href="jav&#x61;script:alert(1)">a</a>')
    expect(out).not.toContain('javascript')
    expect(out).not.toContain('href')
  })

  it('控制字符拆分的 javascript: 协议被剔除', () => {
    const out = sanitizeHtml('<a href="java\tscript:alert(1)">a</a>')
    expect(out).not.toContain('javascript')
    expect(out).not.toContain('href')
  })

  it('https / mailto / tel 链接保留', () => {
    const out = sanitizeHtml(
      '<a href="https://example.com">https</a><a href="mailto:hi@example.com">mail</a><a href="tel:10086">tel</a>',
    )
    expect(out).toContain('href="https://example.com"')
    expect(out).toContain('href="mailto:hi@example.com"')
    expect(out).toContain('href="tel:10086"')
  })

  it('纯文本原样返回，HTML 特殊字符转义', () => {
    expect(sanitizeHtml('普通文本 hello 世界')).toBe('普通文本 hello 世界')
    expect(sanitizeHtml('')).toBe('')
    expect(sanitizeHtml('a < b & c')).toBe('a &lt; b &amp; c')
  })
})
