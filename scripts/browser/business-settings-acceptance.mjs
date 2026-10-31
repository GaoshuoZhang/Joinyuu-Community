// 仅连接隔离 API / 合成数据；验证业务设置位置、作用范围和保存，不触发支付。
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '../..')
const { chromium } = createRequire(process.env.PLAYWRIGHT_PACKAGE)('playwright')
const fixture = JSON.parse(await readFile(resolve(root, 'apps/api/.tmp/fee-visual-private.json'), 'utf8'))
const out = resolve(root, 'apps/api/.tmp/business-settings-20261101')
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(15000)
const errors = [], checks = []
page.on('pageerror', e => errors.push(e.message))
page.on('response', r => { if (r.url().includes('/business-settings/')) console.log(r.status(), new URL(r.url()).pathname) })
const base = 'http://127.0.0.1:17758/#'
const visit = async path => { await page.goto(base + path); await page.waitForLoadState('networkidle') }
const screenshot = async name => page.screenshot({ path: resolve(out, name + '.png'), fullPage: true })
try {
  await visit('/login')
  await page.getByLabel('用户名', { exact: true }).last().fill('admin')
  await page.getByLabel('密码', { exact: true }).last().fill(process.env.ADMIN_E2E_PASSWORD || 'admin123')
  if (await page.getByLabel('图形验证码', { exact: true }).count()) {
    const src = await page.getByAltText('验证码', { exact: true }).getAttribute('src')
    const encoded = src.slice(src.indexOf(',') + 1)
    const svg = src.includes(';base64,') ? Buffer.from(encoded, 'base64').toString() : decodeURIComponent(encoded)
    await page.getByLabel('图形验证码', { exact: true }).fill([...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map(m => m[1]).join(''))
  }
  await page.getByRole('button', { name: '登 录', exact: true }).click()
  await page.waitForURL(/#\/dashboard/)
  const routes = [
    ...['registration', 'finance-tax', 'business-change', 'license'].map(service => ['/enterprise-agency/' + service, 'enterprise-' + service]),
    ['/individuals', 'individuals'], ['/enterprises', 'enterprises'], ['/external-enterprises', 'external-enterprises'],
    ['/mall/goods', 'mall'], ['/demands', 'demands'], ['/spaces', 'spaces'], ['/contents/banners', 'banners'],
    ['/workstations/leases', 'leases'], ['/users', 'users'], ['/system/account?tab=admins', 'admin-accounts'],
  ]
  for (const [route, scope] of routes) {
    console.log('Checking', scope)
    await visit(route)
    const headings = { 'enterprise-registration': '企业注册', 'enterprise-finance-tax': '财税服务', 'enterprise-business-change': '工商变更', 'enterprise-license': '资质许可', individuals: '社区个体', enterprises: '社区企业', 'external-enterprises': '合作企业', mall: '商品管理', demands: '需求管理', spaces: '公共空间管理', banners: '轮播图管理', leases: '租赁管理', users: '用户管理', 'admin-accounts': '账号与权限' }
    await page.getByRole('heading', { name: headings[scope], exact: true }).waitFor()
    await page.getByRole('button', { name: '业务设置', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('tab').first().waitFor()
    await screenshot(scope + '-settings')
    if (scope.startsWith('enterprise-')) {
      for (const tab of ['收费设置', '材料管理']) {
        await dialog.getByRole('tab', { name: tab, exact: true }).click()
        await screenshot(scope + '-' + (tab === '收费设置' ? 'fee' : 'materials'))
      }
    }
    if (['individuals', 'enterprises'].includes(scope)) {
      await dialog.getByRole('tab', { name: '入驻申请表单', exact: true }).click()
      await dialog.getByLabel('表单标题', { exact: true }).click()
      await screenshot(scope + '-form')
    }
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    checks.push(scope + ': scoped settings visible')
  }
  await visit('/individuals')
  await page.getByRole('heading', { name: '社区个体', exact: true }).waitFor()
  await page.getByRole('button', { name: '业务设置', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '社区个体 · 业务设置', exact: true })
  const intro = dialog.getByRole('checkbox', { name: '个人简介', exact: true })
  const initiallyChecked = await intro.isChecked()
  await dialog.getByText('个人简介', { exact: true }).click()
  assert.equal(await intro.isChecked(), !initiallyChecked)
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await page.getByRole('dialog', { name: '放弃未保存的修改？', exact: true }).waitFor({ state: 'hidden' })
  assert.ok(await dialog.isVisible())
  const cardSaved = page.waitForResponse(r => r.request().method() === 'PUT' && r.url().endsWith('/business-settings/individuals/card'))
  await dialog.getByRole('button', { name: '保存名片设置', exact: true }).click()
  assert.equal((await cardSaved).status(), 200)
  checks.push('card save and unsaved changes protection')
  await dialog.getByRole('tab', { name: '入驻申请表单', exact: true }).click()
  await dialog.getByLabel('表单标题', { exact: true }).fill('合成验收：社区个体入驻')
  const formSaved = page.waitForResponse(r => r.request().method() === 'PUT' && r.url().endsWith('/business-settings/individuals/form'))
  await dialog.getByRole('button', { name: '保存表单', exact: true }).click()
  assert.equal((await formSaved).status(), 200)
  const persistedForm = await page.request.get('http://127.0.0.1:17757/api/admin/business-settings/individuals/form', { headers: { Authorization: 'Bearer ' + fixture.admin } })
  assert.equal((await persistedForm.json()).data.title, '合成验收：社区个体入驻')
  await dialog.getByLabel('表单标题', { exact: true }).click()
  await screenshot('individual-form-saved')
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  checks.push('scoped visual application form editor saves')
  await visit('/enterprise-agency/registration')
  await page.getByRole('heading', { name: '企业注册', exact: true }).waitFor()
  await page.getByRole('button', { name: '业务设置', exact: true }).click()
  const agency = page.getByRole('dialog')
  await agency.getByRole('tab', { name: '材料管理', exact: true }).click()
  await agency.getByLabel('办结附件保留天数', { exact: true }).fill('180')
  const saved = page.waitForResponse(r => r.request().method() === 'PUT' && r.url().endsWith('/business-settings/enterprise-registration'))
  await agency.getByRole('button', { name: '保存业务设置', exact: true }).click()
  assert.equal((await saved).status(), 200)
  const finance = await page.request.get('http://127.0.0.1:17757/api/admin/business-settings/enterprise-finance-tax', { headers: { Authorization: 'Bearer ' + fixture.admin } })
  assert.equal(finance.status(), 200)
  assert.equal((await finance.json()).data.values.enterpriseTaxFileRetentionDays, 90)
  checks.push('retention save does not alter sibling service')
  await agency.getByRole('button', { name: '关闭', exact: true }).click()
  await visit('/system/config?section=features')
  await page.getByRole('heading', { name: '系统设置', exact: true }).waitFor()
  await page.getByLabel('企业代办', { exact: true }).click({ trial: true })
  assert.equal(await page.getByText('在线收款', { exact: true }).count(), 0)
  assert.equal(await page.getByText('代办收费设置', { exact: true }).count(), 0)
  assert.equal(await page.getByRole('tab', { name: '名片字段', exact: true }).count(), 0)
  await screenshot('global-settings-slimmed')
  checks.push('global settings no longer duplicates business controls')
  assert.deepEqual(errors, [])
} catch (error) {
  await screenshot('failure').catch(() => {})
  throw error
} finally {
  await writeFile(resolve(out, 'report.json'), JSON.stringify({ checks, errors, isolated: true, realPaymentInvoked: false }, null, 2))
  await browser.close()
}
console.log(`业务设置浏览器验收通过：${checks.length}项；${out}`)
