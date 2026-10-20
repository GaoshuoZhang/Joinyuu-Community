import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

/* 站点品牌运行时：标签页图标必须唯一（内置 SVG 若与上传位图并存，浏览器会优先选 SVG），
 * 标题后缀取站点名称。与客户端 apps/client-mobile/src/utils/siteBranding.ts 同策略。 */
/* url 必须给真实来源：JSDOM 默认 about:blank 是 opaque origin，localStorage 会被禁用 */
const dom = new JSDOM('<!doctype html><html><head><link rel="icon" type="image/svg+xml" href="./favicon.svg"></head><body></body></html>', { url: 'http://localhost/' })
globalThis.document = dom.window.document
globalThis.localStorage = dom.window.localStorage

const { applyFavicon, adminDocumentTitle, setPageTitle, setSiteName } = await import('../src/utils/siteBranding.ts')

const icons = () => [...document.head.querySelectorAll('link[rel~="icon"]')]

test('站点 logo 接管唯一图标节点并写入 MIME', () => {
  applyFavicon('/api/public/files/abc.png')
  assert.equal(icons().length, 1)
  assert.equal(icons()[0].getAttribute('href'), '/api/public/files/abc.png')
  assert.equal(icons()[0].getAttribute('type'), 'image/png')
})

test('清空 logo 回退内置 favicon.svg', () => {
  applyFavicon('/api/public/files/abc.png')
  applyFavicon('')
  assert.equal(icons().length, 1)
  assert.equal(icons()[0].getAttribute('href'), './favicon.svg')
  assert.equal(icons()[0].getAttribute('type'), 'image/svg+xml')
})

test('多余图标节点被清理（避免多个候选互相压制）', () => {
  const extra = document.createElement('link')
  extra.rel = 'shortcut icon'
  extra.href = '/other.ico'
  document.head.appendChild(extra)
  applyFavicon('/api/public/files/abc.webp')
  assert.equal(icons().length, 1)
  assert.equal(icons()[0].getAttribute('type'), 'image/webp')
})

test('标签页标题使用站点名称，且随站点名称变化即时更新', () => {
  setPageTitle('系统配置')
  setSiteName('测试站点名')
  assert.equal(document.title, '系统配置 · 测试站点名管理后台')
  assert.equal(adminDocumentTitle('工作台'), '工作台 · 测试站点名管理后台')
  /* 站点名称为空时回退内置默认名 */
  setSiteName('   ')
  assert.equal(document.title, '系统配置 · 聚屿社区管理后台')
})
