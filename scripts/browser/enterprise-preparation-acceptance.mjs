// 隔离fixture与移动Web dev server；不注入目录数据，不修改日常配置。
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
const { chromium } = createRequire(process.env.PLAYWRIGHT_PACKAGE)('playwright')
const fixture = JSON.parse(await readFile(process.env.AGENCY_E2E_FIXTURE, 'utf8'))
const out = resolve(import.meta.dirname, '../../apps/admin/test/artifacts/enterprise-preparation-20261031')
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
await context.addInitScript(token => localStorage.setItem('joinyuu_client_token', token), fixture.owner)
const page = await context.newPage()
// Vite 的开发代理固定7757；验收会话显式转发到隔离API，不替换业务响应。
await context.route('**/api/**', async route => {
  const response = await route.fetch({ url: route.request().url().replace('http://127.0.0.1:17759/api/', 'http://127.0.0.1:17757/api/') })
  await route.fulfill({ response })
})
const errors = []
page.on('pageerror', error => errors.push(error.message))
const cases = []
try {
  for (const service of ['finance-tax', 'business-change', 'license']) {
    await page.goto(`http://127.0.0.1:17759/me/enterprise-services/${service}`)
    const card = page.locator('.preparation-card')
    await card.waitFor()
    await card.getByText('申请准备与材料清单', { exact: true }).click()
    await page.waitForFunction(() => {
      const card = document.querySelector('.preparation-card')?.getBoundingClientRect()
      const meta = document.querySelector('.preparation-meta')?.getBoundingClientRect()
      return !!card && !!meta && meta.height > 0 && meta.bottom < card.bottom
    })
    assert.ok((await card.innerText()).includes('2026-10-31'))
    await page.screenshot({ path: resolve(out, `${service}-expanded-full.png`), fullPage: true })
    const selector = service === 'license' ? 'licenseType' : service === 'finance-tax' ? 'purpose' : 'changeTypes'
    const labels = {
      'finance-tax': ['代理记账', '旧账整理', '年报与汇算清缴'],
      'business-change': ['名称变更', '法定代表人变更', '地址变更', '经营范围变更', '注册资本变更', '股权变更', '董监高备案', '其他'],
      license: ['食品经营许可', '仅销售预包装食品备案', '人力资源服务许可', '劳务派遣许可', '二类医疗器械经营备案', 'ICP 备案协助', '进出口相关备案协助', '其他事项'],
    }[service]
    for (let index = 0; index < labels.length; index++) {
      const label = labels[index]
      await page.locator(`[data-field-key="${selector}"]`).getByText(label, { exact: true }).click()
      await card.scrollIntoViewIfNeeded()
      await page.screenshot({ path: resolve(out, `${service}-variant-${index}.png`) })
      cases.push({ service, variant: label, guide: await card.innerText() })
    }
    if (service === 'finance-tax') {
      await page.getByText('有，需要交接', { exact: true }).click()
      assert.ok((await card.innerText()).includes('历史报表'))
      await page.getByText('无，无需交接', { exact: true }).click()
      assert.ok(!(await card.innerText()).includes('历史报表'))
    }
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 })
      await card.scrollIntoViewIfNeeded()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.screenshot({ path: resolve(out, `${service}-${width}.png`) })
    }
  }
  await page.evaluate(() => localStorage.setItem('joinyuu_theme', 'dark'))
  await page.reload()
  await page.locator('.preparation-card').waitFor()
  await page.locator('.preparation-card').getByText('申请准备与材料清单', { exact: true }).click()
  await page.waitForFunction(() => {
      const card = document.querySelector('.preparation-card')?.getBoundingClientRect()
      const meta = document.querySelector('.preparation-meta')?.getBoundingClientRect()
      return !!card && !!meta && meta.height > 0 && meta.bottom < card.bottom
    })
  assert.equal(await page.locator('html').getAttribute('theme-mode'), 'dark')
  await page.screenshot({ path: resolve(out, 'license-dark.png') })
  assert.equal(errors.length, 0, errors.join('\n'))
  assert.equal(cases.filter(item => item.service === 'license').length, 8)
  await writeFile(resolve(out, 'report.json'), JSON.stringify({ cases, errors }, null, 2))
  console.log(`PASS ${cases.length} selected variants, 320/390 widths, conditional materials; ${out}`)
} finally { await browser.close() }
