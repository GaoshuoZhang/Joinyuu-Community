// 显式的隔离验收：fixture/Jest服务17757、后台17758、移动Web17759。
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

assert.ok(process.env.PLAYWRIGHT_PACKAGE, '请指定已安装Playwright的package.json')
assert.ok(process.env.AGENCY_E2E_FIXTURE, '请指定隔离fixture私有文件')
const { chromium } = createRequire(process.env.PLAYWRIGHT_PACKAGE)('playwright')
const fixture = JSON.parse(await readFile(process.env.AGENCY_E2E_FIXTURE, 'utf8'))
const root = resolve(import.meta.dirname, '../..')
const out = resolve(root, 'apps/admin/test/artifacts/enterprise-services-20261031')
await mkdir(out, { recursive: true })
const apiBase = 'http://127.0.0.1:17757/api'
const mobileBase = 'http://127.0.0.1:17759'
const adminBase = 'http://127.0.0.1:17758'
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage()
const errors = []
const records = []
page.on('pageerror', error => errors.push(error.message))
page.setDefaultTimeout(15000)
await context.addInitScript(token => localStorage.setItem('joinyuu_client_token', token), fixture.owner)

async function api(path, { admin = false, method = 'GET', data } = {}) {
  const response = await context.request.fetch(apiBase + path, {
    method, data, headers: { Authorization: 'Bearer ' + (admin ? fixture.admin : fixture.owner) },
  })
  assert.equal(response.status(), 200, `${method} ${path}: ${response.status()} ${await response.text()}`)
  return (await response.json()).data
}
const field = key => page.locator(`[data-field-key="${key}"]`)
const fill = (key, text) => field(key).locator('input,textarea').first().fill(text)
async function visit(path) {
  await page.goto(mobileBase + path)
  await page.waitForLoadState('networkidle')
}
async function screenshots(name) {
  await page.screenshot({ path: resolve(out, `${name}-full.png`), fullPage: true })
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let top = 0, index = 0; top < height; top += 700, index++) {
    await page.evaluate(y => window.scrollTo(0, y), top)
    await page.screenshot({ path: resolve(out, `${name}-scroll-${index}.png`) })
  }
}
async function submit(service, revise = false) {
  if (revise) {
    assert.equal(await field('contact.name').locator('input').inputValue(), '合成联系人')
    assert.equal(await field('contact.phone').locator('input').inputValue(), '13800000001')
  }
  const label = revise ? '重新提交申请' : `提交${{ 'finance-tax': '财税服务', 'business-change': '工商变更', license: '资质许可' }[service]}申请`
  const endpoint = `/enterprise-services/${service}/applications`
  const response = page.waitForResponse(r => r.url().includes(endpoint) && r.request().method() === 'POST')
  await page.getByRole('button', { name: label, exact: true }).click()
  const sent = await response
  assert.equal(sent.status(), 200, await sent.text())
  assert.ok(sent.request().headers()['x-idempotency-key'], '新表单请求须带幂等键')
  await page.getByText(revise ? '申请已重新提交' : '申请已提交', { exact: true }).waitFor()
  return (await sent.json()).data
}

try {
  // 仅限本脚本固定的隔离端口；避免上一轮暂停用例留下关闭状态。
  const initialConfig = await api('/admin/system/config', { admin: true })
  await api('/admin/system/config', { admin: true, method: 'PUT', data: {
    ...initialConfig, enterpriseTaxOpen: true, enterpriseChangeOpen: true, enterpriseLicenseOpen: true,
  } })
  for (const service of ['finance-tax', 'business-change', 'license']) {
    await visit('/me/enterprise-services/' + service)
    await field('company.name').waitFor()
    await fill('company.name', `隔离Web验收-${service}`)
    await fill('company.creditCode', '91310000MA1K000000')
    if (service === 'finance-tax') {
      await field('monthlyVoucherBand').getByText('每月 11–30 张', { exact: true }).click()
      await fill('startMonth', '2026-10')
    } else if (service === 'business-change') {
      await field('changeTypes').getByText('经营范围变更', { exact: true }).click()
      await fill('scope.newScope', '软件开发及信息技术咨询服务（隔离验收）')
    } else {
      await fill('region', '隔离市测试区')
      await fill('principalName', '合成负责人')
      await fill('premisesNote', '隔离测试场所说明，不含实际个人信息')
      await fill('equipmentNote', '隔离测试设备设施说明')
    }
    await fill('contact.name', '合成联系人')
    await fill('contact.phone', '13800000001')
    const uploaded = page.waitForResponse(r => r.url().includes(`/enterprise-services/${service}/uploads`) && r.request().method() === 'POST')
    await field('licenseCopy').locator('input[type=file]').setInputFiles({
      name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% isolated form acceptance\n%%EOF'),
    })
    assert.equal((await uploaded).status(), 200)
    await field('consent').getByRole('checkbox').click()
    await screenshots(`${service}-form`)
    const { id } = await submit(service)
    const detailPath = `/me/enterprise-services/${service}/${id}`
    await page.getByRole('button', { name: '查看办理进度', exact: true }).click()
    await page.waitForURL(mobileBase + detailPath)
    await page.getByRole('button', { name: '撤回申请', exact: true }).waitFor()
    await screenshots(`${service}-pending`)
    const withdrawn = page.waitForResponse(r => r.url().endsWith(`/${id}/withdraw`) && r.request().method() === 'POST')
    await page.getByRole('button', { name: '撤回申请', exact: true }).click()
    await page.getByRole('button', { name: '确认撤回', exact: true }).click()
    assert.equal((await withdrawn).status(), 200)
    await page.getByRole('button', { name: '修改并重新提交', exact: true }).waitFor()
    await page.getByRole('button', { name: '修改并重新提交', exact: true }).click()
    await field('company.name').waitFor()
    assert.equal(await field('company.name').locator('input').inputValue(), `隔离Web验收-${service}`)
    await submit(service, true)
    const processPath = `/admin/enterprise-services/${service}/applications/${id}`
    for (const action of ['reject', 'request-info']) {
      await api(`${processPath}/${action}`, { admin: true, method: 'POST', data: { reason: '请核对合成材料（隔离验收）' } })
      await visit(detailPath)
      await page.getByRole('button', { name: '修改并重新提交', exact: true }).click()
      await field('company.name').waitFor()
      await submit(service, true)
    }
    await api(`${processPath}/accept`, { admin: true, method: 'POST', data: {} })
    await api(`${processPath}/complete`, { admin: true, method: 'POST', data: { reason: '约定事项交付完成（隔离验收）' } })
    await visit(detailPath)
    assert.equal(await page.getByRole('button', { name: '撤回申请', exact: true }).count(), 0)
    assert.equal(await page.getByRole('button', { name: '修改并重新提交', exact: true }).count(), 0)
    const current = await api(`/app/enterprise-services/${service}/applications/${id}`)
    assert.equal(current.status, 'completed')
    assert.deepEqual(current.records.map(record => record.action), ['submit', 'withdraw', 'resubmit', 'reject', 'resubmit', 'request_info', 'resubmit', 'accept', 'complete'])
    await screenshots(`${service}-completed`)
    records.push({ service, id, status: current.status, recordCount: current.records.length })
    console.log('PASS mobile', service, id)
  }

  const config = await api('/admin/system/config', { admin: true })
  await api('/admin/system/config', { admin: true, method: 'PUT', data: {
    ...config, enterpriseTaxOpen: false, enterpriseChangeOpen: false, enterpriseLicenseOpen: false,
  } })
  try {
    await visit('/me/enterprise-agency')
    await page.getByText('暂未开放新申请，已有申请可继续办理').first().waitFor()
    const cards = page.locator('.service-cell')
    for (let index = 0; index < 3; index++) assert.equal(await cards.nth(index).getByRole('button').isDisabled(), true)
    await screenshots('paused-hub')
    const adminPage = await context.newPage()
    await adminPage.goto(adminBase + '/#/login')
    await adminPage.waitForLoadState('networkidle')
    await adminPage.getByLabel('用户名', { exact: true }).last().fill('admin')
    await adminPage.getByLabel('密码', { exact: true }).last().fill(process.env.ADMIN_E2E_PASSWORD || 'admin123')
    const captcha = adminPage.getByLabel('图形验证码', { exact: true })
    if (await captcha.count()) {
      const src = await adminPage.getByAltText('验证码', { exact: true }).getAttribute('src')
      const payload = src.slice(src.indexOf(',') + 1)
      const svg = src.includes(';base64,') ? Buffer.from(payload, 'base64').toString() : decodeURIComponent(payload)
      const code = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map(item => item[1]).join('')
      await captcha.last().fill(code)
    }
    await adminPage.getByRole('button', { name: '登 录', exact: true }).click()
    await adminPage.waitForURL(/#\/dashboard/)
    await adminPage.goto(adminBase + '/#/system/config?section=features')
    for (const label of ['企业代办财税服务', '企业代办工商变更', '企业代办资质许可']) {
      const toggle = adminPage.getByRole('switch', { name: label, exact: true })
      await toggle.waitFor()
      assert.equal(await toggle.getAttribute('aria-checked'), 'false')
    }
    await adminPage.getByRole('switch', { name: '企业代办财税服务', exact: true }).click()
    const saved = adminPage.waitForResponse(r => r.url().endsWith('/api/admin/system/config') && r.request().method() === 'PUT')
    await adminPage.getByRole('button', { name: '保存配置', exact: true }).click()
    assert.equal((await saved).status(), 200)
    await adminPage.reload()
    const enabledToggle = adminPage.getByRole('switch', { name: '企业代办财税服务', exact: true })
    await enabledToggle.waitFor()
    assert.equal(await enabledToggle.getAttribute('aria-checked'), 'true')
    assert.equal((await api('/app/enterprise-services/catalog')).services.find(item => item.route === 'finance-tax').enabled, true)
    await adminPage.screenshot({ path: resolve(out, 'admin-switches.png'), fullPage: true })
    await adminPage.close()
  } finally { await api('/admin/system/config', { admin: true, method: 'PUT', data: {
    ...config, enterpriseTaxOpen: true, enterpriseChangeOpen: true, enterpriseLicenseOpen: true,
  } }) }
  assert.deepEqual(errors, [])
} catch (error) {
  await page.screenshot({ path: resolve(out, 'failure.png'), fullPage: true }).catch(() => {})
  throw error
} finally {
  await writeFile(resolve(out, 'report.json'), JSON.stringify({ records, errors }, null, 2))
  await browser.close()
}
