import { describe, expect, it, beforeEach } from 'vitest'
import { applyFavicon } from './siteBranding'

/* 标签页图标：必须始终只有一个 link[rel=icon]，否则内置 SVG 会压制上传的位图（后台同策略） */
describe('applyFavicon', () => {
  beforeEach(() => {
    document.head.innerHTML = '<link rel="icon" type="image/svg+xml" href="/favicon.svg">'
  })

  const icons = () => Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'))

  it('接管唯一图标节点并写入站点 logo 与 MIME', () => {
    applyFavicon('/api/public/files/abc.png')
    expect(icons()).toHaveLength(1)
    expect(icons()[0].getAttribute('href')).toBe('/api/public/files/abc.png')
    expect(icons()[0].getAttribute('type')).toBe('image/png')
  })

  it('清空 logo 时回退内置 svg', () => {
    applyFavicon('/api/public/files/abc.png')
    applyFavicon('')
    expect(icons()).toHaveLength(1)
    expect(icons()[0].getAttribute('href')).toBe('/favicon.svg')
    expect(icons()[0].getAttribute('type')).toBe('image/svg+xml')
  })

  it('清理多余图标节点（避免多个候选互相压制）', () => {
    const extra = document.createElement('link')
    extra.rel = 'shortcut icon'
    extra.href = '/other.ico'
    document.head.appendChild(extra)
    applyFavicon('/api/public/files/abc.webp')
    expect(icons()).toHaveLength(1)
    expect(icons()[0].getAttribute('href')).toBe('/api/public/files/abc.webp')
    expect(icons()[0].getAttribute('type')).toBe('image/webp')
  })

  it('无图标节点时新建一个', () => {
    document.head.innerHTML = ''
    applyFavicon('/api/public/files/abc.jpg')
    expect(icons()).toHaveLength(1)
    expect(icons()[0].rel).toBe('icon')
  })
})
