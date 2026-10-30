import { createRequire } from 'node:module'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '../..')
assert.ok(process.env.PLAYWRIGHT_PACKAGE, '请设置PLAYWRIGHT_PACKAGE为已安装Playwright的package.json绝对路径')
const { chromium } = createRequire(process.env.PLAYWRIGHT_PACKAGE)('playwright')
const fixture = JSON.parse(await readFile(process.env.AGENCY_E2E_FIXTURE || resolve(root, 'apps/api/.tmp/agency-visual-private.json'), 'utf8'))
const base = 'http://127.0.0.1:17758'
const out = resolve(root, 'apps/admin/test/artifacts/system-management-20261031')
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const report = { checks: [], errors: [], screenshots: [] }
async function session(permissions = ['*'], dataScope = []) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 } })
  await context.addInitScript(({ token, permissions, dataScope }) => {
    localStorage.setItem('joinyuu_admin_token', token)
    localStorage.setItem('joinyuu_admin_perm_codes', JSON.stringify(permissions))
    localStorage.setItem('joinyuu_admin_scope_codes', JSON.stringify(dataScope))
    localStorage.setItem('joinyuu_admin_name', '隔离验收')
  }, { token: fixture.admin, permissions, dataScope })
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  page.on('pageerror', error => report.errors.push(error.message))
  return { context, page }
}
async function shot(page, name) {
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: resolve(out, name + '.png'), fullPage: true, animations: 'disabled' })
  report.screenshots.push(name + '.png')
}
async function visit(page, path, title) {
  await page.goto(base + '/#' + path)
  if (title) await page.getByRole('heading', { name: title, exact: true }).waitFor()
}
let page
try {
  const current = await session(); page = current.page
  await visit(page, '/system/config', '系统设置')
  await page.getByLabel('站点名称', { exact: true }).last().waitFor()
  await page.locator('.config-form input:not([disabled])').first().waitFor()
  const side = page.locator('aside')
  for (const label of ['系统设置', '账号与权限', '数据与资源', '运行与审计', '注销工单']) assert.equal(await side.getByText(label, { exact: true }).count(), 1, label)
  for (const label of ['申请表单配置', '协议与政策', '素材库', '系统监控', '关于']) assert.equal(await side.getByText(label, { exact: true }).count(), 0, label)
  await shot(page, 'settings-site')
  report.checks.push('five system menu items')
  const siteName = page.getByLabel('站点名称', { exact: true }).last()
  const original = await siteName.inputValue()
  await siteName.fill(original + '未保存验收')
  await page.getByRole('tab', { name: '通知服务', exact: true }).click()
  await page.getByRole('tab', { name: '发送记录', exact: true }).waitFor()
  await shot(page, 'settings-notifications')
  await page.getByRole('tab', { name: '站点与功能', exact: true }).click()
  assert.equal(await siteName.inputValue(), original + '未保存验收')
  await side.getByText('数据与资源', { exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '继续编辑', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.match(page.url(), /system\/config/)
  assert.equal(await siteName.inputValue(), original + '未保存验收')
  await siteName.fill(original)
  await page.getByText('暂无未保存修改', { exact: true }).waitFor()
  report.checks.push('draft retained between settings tabs and leave cancellation')
  await page.getByRole('tab', { name: '功能开关', exact: true }).click()
  for (const top of [0, 650, 1300]) {
    await page.locator('.page-scroll').evaluate((element, top) => { element.scrollTop = top }, top)
    await shot(page, 'settings-features-scroll-' + top)
  }
  await page.getByRole('tab', { name: '移动端主题', exact: true }).click()
  await shot(page, 'settings-mobile-themes')
  await page.getByRole('tab', { name: '收款配置', exact: true }).click()
  await shot(page, 'settings-payment')
  await page.getByRole('tab', { name: '业务规范', exact: true }).click()
  await page.getByLabel('申请类型', { exact: true }).last().waitFor()
  assert.equal(await page.getByRole('tab', { name: '企业入驻', exact: true }).count(), 0)
  await shot(page, 'settings-business-forms')
  const titleField = page.getByLabel('表单标题', { exact: true }).last()
  const originalTitle = await titleField.inputValue()
  await titleField.fill(originalTitle + '草稿验收')
  const typeControl = page.getByLabel('申请类型', { exact: true }).last()
  await typeControl.click()
  const options = page.locator('.t-select-option:visible')
  const firstOption = (await options.first().textContent()).trim()
  await options.nth(1).click()
  await options.first().waitFor({ state: 'hidden' })
  await typeControl.click()
  await page.locator('.t-select-option:visible').filter({ hasText: firstOption }).click()
  assert.equal(await titleField.inputValue(), originalTitle + '草稿验收')
  await titleField.fill(originalTitle)
  report.checks.push('application type selector preserves per-type drafts')
  await page.getByRole('tab', { name: '协议与政策', exact: true }).click()
  await page.getByRole('button', { name: /新增|发布/ }).first().waitFor()
  await shot(page, 'settings-business-policies')
  let legacyIndex = 0
  for (const [path, title, tab] of [
    ['/system/application-form-config', '系统设置', '申请表单'], ['/system/policies', '系统设置', '协议与政策'],
    ['/assets/library?source=article&keyword=图', '数据与资源', '素材库'],
    ['/system/trash?activeDomain=project&keyword=计划&page=2', '数据与资源', '归档管理'],
    ['/system/config?tab=archive&archivekeyword=保留', '数据与资源', '归档管理'],
    ['/system/monitor', '运行与审计', '系统监控'], ['/logs/audit?page=2&keyword=测试', '运行与审计', '操作日志'],
    ['/system/roles', '账号与权限', '角色权限'],
  ]) {
    await visit(page, path, title)
    await page.getByRole('tab', { name: tab, exact: true }).and(page.locator('[aria-selected="true"]')).waitFor()
    assert.equal(await page.getByRole('tab', { name: tab, exact: true }).getAttribute('aria-selected'), 'true', path)
    if (path.startsWith('/system/trash')) assert.match(page.url(), /archivekeyword=/)
    if (path.startsWith('/logs/audit')) assert.match(page.url(), /audit.keyword=/)
    await shot(page, 'legacy-' + (++legacyIndex) + '-' + tab)
  }
  report.checks.push('legacy routes select corresponding panels and retain filters')
  await visit(page, '/system/logs?tab=monitor', '运行与审计')
  await page.getByRole('button', { name: '刷新数据', exact: true }).waitFor()
  await shot(page, 'operations-monitor')
  await page.getByRole('button', { name: '切换暗色模式', exact: true }).click()
  await shot(page, 'operations-dark')
  await visit(page, '/system/config?tab=business&businessTab=forms', '系统设置')
  await page.setViewportSize({ width: 1024, height: 860 })
  await shot(page, 'settings-compact-dark')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.getByRole('button', { name: '管理员菜单', exact: true }).click()
  await page.getByText('关于', { exact: true }).click()
  await page.getByRole('heading', { name: '关于', exact: true }).waitFor()
  await shot(page, 'about-admin-menu')
  await current.context.close()
  for (const [permissions, scopes, expected] of [
    [['/approvals'], ['members'], ['业务规范']], [['/system/policies'], ['system'], ['业务规范']],
    [['/system/messages'], ['system'], ['通知服务']], [['/system/config'], ['system'], ['站点与功能', '移动端主题', '收款配置']],
  ]) {
    const role = await session(permissions, scopes); page = role.page
    await visit(page, '/system/config', '系统设置')
    for (const name of ['站点与功能', '业务规范', '移动端主题', '通知服务', '收款配置']) assert.equal(await page.getByRole('tab', { name, exact: true }).count(), expected.includes(name) ? 1 : 0, permissions + ':' + name)
    await shot(page, 'role-' + permissions[0].replaceAll('/', '-'))
    await role.context.close()
  }
  report.checks.push('client permission and scope combinations expose only matching settings panels')
  assert.deepEqual(report.errors, [])
} catch (error) {
  if (page && !page.isClosed()) await shot(page, 'failure').catch(() => {})
  throw error
} finally {
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
