import { createRequire } from 'node:module'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
const root = resolve(import.meta.dirname, '../..')
const { chromium } = createRequire(process.env.PLAYWRIGHT_PACKAGE)('playwright')
const fixture = JSON.parse(await readFile(process.env.AGENCY_E2E_FIXTURE, 'utf8'))
const out = resolve(root, 'apps/admin/test/artifacts/enterprise-material-lifecycle-20261031')
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 980 } })
await context.addInitScript(token => {
  localStorage.setItem('joinyuu_admin_token', token)
  localStorage.setItem('joinyuu_admin_perm_codes', JSON.stringify(['*']))
  localStorage.setItem('joinyuu_admin_scope_codes', '[]')
}, fixture.admin)
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
const configUrl = 'http://127.0.0.1:17757/api/admin/system/config'
const headers = { Authorization: 'Bearer ' + fixture.admin }
const original = (await (await context.request.get(configUrl, { headers })).json()).data
try {
  await page.goto('http://127.0.0.1:17758/#/system/config?section=features')
  const row = page.locator('.switch-row').filter({ has: page.getByText('办结附件保留天数', { exact: true }) })
  const input = row.locator('input').first()
  await input.waitFor()
  await page.waitForLoadState('networkidle')
  assert.equal(await input.inputValue(), String(original.enterpriseAgencyFileRetentionDays))
  await input.fill('120')
  await input.press('Tab')
  const saved = page.waitForResponse(response => response.url().endsWith('/api/admin/system/config') && response.request().method() === 'PUT')
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  assert.equal((await saved).status(), 200)
  await page.reload()
  await page.waitForLoadState('networkidle')
  assert.equal(await input.inputValue(), '120')
  await row.scrollIntoViewIfNeeded()
  await page.screenshot({ path: resolve(out, 'admin-material-retention.png'), fullPage: true, animations: 'disabled' })
  const actual = (await (await context.request.get(configUrl, { headers })).json()).data
  assert.equal(actual.enterpriseAgencyFileRetentionDays, 120)
  const publicConfig = (await (await context.request.get('http://127.0.0.1:17757/api/app/config')).json()).data
  assert.ok(!('enterpriseAgencyFileRetentionDays' in publicConfig))
  assert.deepEqual(errors, [])
  await writeFile(resolve(out, 'admin-retention-report.json'), JSON.stringify({ savedDays: 120, restoredDays: original.enterpriseAgencyFileRetentionDays, publicConfigHidesDays: true, errors }, null, 2))
  console.log('PASS admin material retention save/reload, app config hides retention days')
} finally {
  const restored = await context.request.put(configUrl, { headers, data: original })
  assert.equal(restored.status(), 200)
  await browser.close()
}
