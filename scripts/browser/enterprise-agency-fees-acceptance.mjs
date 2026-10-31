// 仅在隔离 fixture 和模拟微信渠道上验收；不访问日常库或真实支付服务。
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
assert.ok(process.env.PLAYWRIGHT_PACKAGE, '指定本机 Playwright package.json')
const { chromium } = createRequire(process.env.PLAYWRIGHT_PACKAGE)('playwright')
const root = resolve(import.meta.dirname, '../..')
const fixture = JSON.parse(await readFile(resolve(root, 'apps/api/.tmp/fee-visual-private.json'), 'utf8'))
const out = resolve(root, 'apps/api/.tmp/agency-fees-visual-20261031')
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } })
const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await mobile.addInitScript(token => localStorage.setItem('joinyuu_client_token', token), fixture.owner)
const page = await mobile.newPage(), management = await admin.newPage()
const errors = [], checks = []
for (const p of [page, management]) { p.setDefaultTimeout(15000); p.on('pageerror', e => errors.push(e.message)) }
const mobileBase = 'http://127.0.0.1:17759', adminBase = 'http://127.0.0.1:17758'
async function visit(p, url) { await p.goto(url); await p.waitForLoadState('networkidle') }
const route = sample => sample.service === 'registration' ? '/me/enterprise-agency/registration/' + sample.id : '/me/enterprise-services/' + sample.service + '/' + sample.id
async function shot(p, name, scrolling = false) {
  await p.screenshot({ path: resolve(out, name + '-full.png'), fullPage: true })
  if (scrolling) {
    const height = await p.evaluate(() => document.documentElement.scrollHeight)
    for (let y = 0, n = 0; y < height; y += 680, n++) {
      await p.evaluate(top => window.scrollTo(0, top), y)
      await p.screenshot({ path: resolve(out, name + '-scroll-' + n + '.png') })
    }
  }
}
async function fee(sample) {
  const response = await mobile.request.get('http://127.0.0.1:17757/api/app/enterprise-services/fee?' + new URLSearchParams({ service: sample.service, id: sample.id }), { headers: { Authorization: 'Bearer ' + fixture.owner } })
  assert.equal(response.status(), 200)
  return (await response.json()).data
}
try {
  await visit(management, adminBase + '/#/login')
  await management.getByLabel('用户名', { exact: true }).last().fill('admin')
  await management.getByLabel('密码', { exact: true }).last().fill(process.env.ADMIN_E2E_PASSWORD || 'admin123')
  if (await management.getByLabel('图形验证码', { exact: true }).count()) {
    const image = await management.getByAltText('验证码', { exact: true }).getAttribute('src')
    const content = image.slice(image.indexOf(',') + 1)
    const svg = image.includes(';base64,') ? Buffer.from(content, 'base64').toString() : decodeURIComponent(content)
    const answer = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map(match => match[1]).join('')
    await management.getByLabel('图形验证码', { exact: true }).fill(answer)
  }
  await management.getByRole('button', { name: '登 录', exact: true }).click()
  await management.waitForURL(/#\/dashboard/)
  for (const sample of fixture.samples) {
    await visit(page, mobileBase + route(sample))
    const card = page.locator('.agency-fee')
    await card.waitFor()
    await card.getByText(sample.mode === 'free' ? '本次申请已确认为免费，无需缴费。' : sample.mode === 'manual' ? '受理时确认是否收费及具体金额。' : '退款说明', { exact: true }).waitFor()
    await shot(page, 'web-' + sample.service + '-' + sample.mode, true)
    assert.ok(await card.isVisible())
    checks.push('web ' + sample.service + '/' + sample.mode)
  }
  const fixed = fixture.samples.find(s => s.service === 'finance-tax' && s.mode === 'fixed')
  await visit(page, mobileBase + '/checkout/' + fixed.orderId)
  await page.getByRole('button', { name: '微信扫码支付', exact: true }).waitFor()
  for (const service of ['registration', 'finance-tax', 'business-change', 'license']) {
    const pending = fixture.samples.find(s => s.service === service && s.mode === 'manual')
    await visit(management, adminBase + '/#/enterprise-agency/' + service)
    await management.getByRole('tab', { name: '费用账单', exact: true }).click()
    await management.getByRole('columnheader', { name: '办理编号' }).waitFor()
    await shot(management, 'admin-' + service + '-fees')
    await visit(management, adminBase + '/#/enterprise-agency/' + service + '/' + pending.id)
    await management.getByRole('button', { name: '受理', exact: true }).click()
    const dialog = management.getByRole('dialog')
    await dialog.getByText('人工报价', { exact: true }).waitFor()
    await dialog.getByLabel('报价金额（元）').fill('299.00')
    await dialog.getByLabel('报价说明', { exact: true }).fill('合成验收报价：服务范围经双方确认，资料收集与后续办理分别记录。')
    await shot(management, 'admin-' + service + '-quote')
    const accepted = management.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/' + pending.id + '/accept'))
    await dialog.getByRole('button', { name: '确认', exact: true }).click()
    assert.equal((await accepted).status(), 200)
    const projection = await fee(pending)
    assert.equal(projection.amountFen, 29900)
    assert.equal(projection.paidFen, 0)
    checks.push('manual accept ' + service)
  }
  await visit(management, adminBase + '/#/enterprise-agency/finance-tax')
  await management.getByRole('tab', { name: '费用账单', exact: true }).click()
  await management.getByRole('row').filter({ hasText: fixed.id }).getByRole('button', { name: '费用详情' }).click()
  const dialog = management.getByRole('dialog')
  await dialog.getByLabel('新金额（元）').fill('249.00')
  await dialog.getByLabel('调整原因', { exact: true }).fill('合成验收：增加约定服务范围，调整费用。')
  const updated = management.waitForResponse(r => r.request().method() === 'PUT' && r.url().includes('/fees/'))
  await dialog.getByRole('button', { name: '确认改价并通知用户' }).click()
  assert.equal((await updated).status(), 200)
  assert.equal((await fee(fixed)).amountFen, 24900)
  await shot(management, 'admin-reprice-applied')
  // 收银台仍持有旧报价；应拒绝支付并刷新，不能自动按新价调起。
  await page.getByRole('button', { name: '微信扫码支付', exact: true }).click()
  const confirm = page.getByRole('dialog')
  await confirm.getByText(/199\.00/).waitFor()
  const denied = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/payments'))
  await confirm.getByRole('button', { name: '确认并支付', exact: true }).click()
  assert.equal((await denied).status(), 409)
  await page.getByText('¥249.00', { exact: true }).first().waitFor()
  checks.push('stale quote rejected; new amount requires reconfirmation')
  await visit(page, mobileBase + route(fixed))
  await page.getByRole('button', { name: '查看费用调整记录' }).click()
  await shot(page, 'web-reprice-history', true)
  await page.setViewportSize({ width: 320, height: 740 })
  await shot(page, 'web-narrow-fee', true)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'narrow page overflows horizontally')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.reload(); await page.waitForLoadState('networkidle')
  await shot(page, 'web-dark-fee', true)
  checks.push('320px overflow and system dark mode captured')
  assert.deepEqual(errors, [])
} catch (error) {
  await page.screenshot({ path: resolve(out, 'failure-web.png'), fullPage: true }).catch(() => {})
  await management.screenshot({ path: resolve(out, 'failure-admin.png'), fullPage: true }).catch(() => {})
  throw error
} finally {
  await writeFile(resolve(out, 'browser-report.json'), JSON.stringify({ checks, errors, channel: 'mock only', screenshotDirectory: out }, null, 2))
  await browser.close()
}
console.log('Fee browser acceptance passed: ' + checks.length + ' checks; ' + out)
