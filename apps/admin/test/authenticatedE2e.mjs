import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

// Run only against the isolated fixture described in e2e-report-20261015.md.
// PLAYWRIGHT_PACKAGE points to an installed Playwright package; no project dependency is added.
const require = createRequire(process.env.PLAYWRIGHT_PACKAGE || 'C:/Users/Gaoshuo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const base = process.env.ADMIN_E2E_URL || 'http://127.0.0.1:17758'
assert.equal(new URL(base).hostname, '127.0.0.1')
assert.equal(new URL(base).port, '17758', 'This suite mutates fixtures and requires the isolated admin port')
const out = fileURLToPath(new URL('./artifacts/e2e-20261015/', import.meta.url))
const manifest = JSON.parse(await readFile(new URL('./authenticated-route-manifest.json', import.meta.url), 'utf8'))
await mkdir(out, { recursive: true })
const group = process.argv[2] || 'business'
const records = []
const match = process.env.ADMIN_E2E_MATCH && new RegExp(process.env.ADMIN_E2E_MATCH)
if (match) {
  try { records.push(...JSON.parse(await readFile(out + `followup-${group}.json`, 'utf8')).records) } catch { /* First run. */ }
}
const runtimeErrors = []
const resourceErrors = []
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
page.setDefaultTimeout(10000)
page.on('pageerror', e => runtimeErrors.push(e.message))
page.on('response', r => {
  if (r.status() >= 400 && !r.url().includes('/api/admin/')) resourceErrors.push({ url: new URL(r.url()).pathname, status: r.status() })
})
let nav = 0
let token
const save = () => writeFile(out + `followup-${group}.json`, JSON.stringify({ records, runtimeErrors, resourceErrors }, null, 2))
async function test(name, fn) {
  if (match && !match.test(name)) return
  const previous = records.findIndex(r => r.name === name)
  if (previous >= 0) records.splice(previous, 1)
  try {
    const data = await fn()
    records.push({ name, pass: true, data })
    console.log('PASS', name, JSON.stringify(data ?? {}))
  } catch (e) {
    records.push({ name, pass: false, error: e.message })
    console.log('FAIL', name, e.message.split('\n')[0])
    await page.screenshot({ path: out + `failure-${group}-${records.length}.png` }).catch(() => {})
  }
  await save()
}
async function login(p = page, username = 'admin', password = process.env.ADMIN_E2E_PASSWORD || 'admin123') {
  await p.goto(base + '/#/login')
  const img = p.getByAltText('验证码', { exact: true })
  await img.waitFor()
  const src = await img.getAttribute('src')
  const payload = src.slice(src.indexOf(',') + 1)
  const svg = src.includes(';base64,') ? Buffer.from(payload, 'base64').toString() : decodeURIComponent(payload)
  const code = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map(x => x[1]).join('')
  assert.equal(code.length, 4)
  await p.getByLabel('用户名', { exact: true }).last().fill(username)
  await p.getByLabel('密码', { exact: true }).last().fill(password)
  await p.getByLabel('图形验证码', { exact: true }).last().fill(code)
  await p.getByRole('button', { name: '登 录', exact: true }).click()
  await p.waitForURL(/#\/dashboard/)
  await p.waitForLoadState('networkidle')
}
async function visit(path) {
  await page.goto(base + '/?e2eFollowup=' + ++nav + '#' + path)
  await page.waitForFunction(() => document.title.includes('管理后台') && !document.documentElement.dataset.routeLoading && document.querySelector('#app')?.textContent?.length > 10)
  await page.waitForLoadState('networkidle')
}
async function api(path, options = {}) {
  const r = await context.request.fetch(base + '/api/admin' + path, { timeout: 10000, ...options, headers: { Authorization: 'Bearer ' + token, ...options.headers } })
  assert.equal(r.status(), 200, `API ${path}: ${r.status()}`)
  const b = await r.json()
  assert.equal(b.code, 0, `API ${path}: ${b.message}`)
  return b.data
}
const dialog = () => page.locator('.t-dialog:visible').last()
const drawer = () => page.locator('.t-drawer__content-wrapper:visible').last()
async function submit(locator, name, endpoint, method = 'PUT') {
  const response = page.waitForResponse(r => r.url().includes(endpoint) && r.request().method() === method)
  const [r] = await Promise.all([response, locator.getByRole('button', { name, exact: true }).click()])
  assert.equal(r.status(), 200)
  assert.equal((await r.json()).code, 0)
  await page.waitForLoadState('networkidle')
}
async function reload() { await page.reload(); await page.waitForLoadState('networkidle') }
async function discardDialog(d = dialog()) {
  await d.getByRole('button', { name: '取消', exact: true }).click()
  const abandon = page.getByRole('button', { name: '放弃修改并关闭', exact: true })
  await abandon.click()
  await page.waitForFunction(() => ![...document.querySelectorAll('.t-dialog')].some(e => e.getBoundingClientRect().height > 0))
}

try {
  await login()
  token = await page.evaluate(() => localStorage.getItem('joinyuu_admin_token'))
  if (group === 'business') {
    await test('留言查询条件刷新恢复与重置', async () => {
      await visit('/user-messages')
      const input = page.locator('.page-filter-bar input[type=text]:visible').first()
      await input.fill('E2E-不存在-20261015')
      await page.getByRole('button', { name: '查询', exact: true }).click()
      await page.waitForFunction(() => location.hash.includes('keyword='))
      await reload()
      assert.equal(await input.inputValue(), 'E2E-不存在-20261015')
      await page.getByRole('button', { name: '清除筛选', exact: true }).click()
      await page.waitForFunction(() => !location.hash.includes('keyword='))
      assert.equal(await input.inputValue(), '')
    })
    for (const mode of ['edit', 'create']) await test(`办公位慢网络输入保护：${mode}`, async () => {
      await visit('/workstations')
      let release
      const gate = new Promise(r => { release = r })
      let entered
      const started = new Promise(r => { entered = r })
      const handler = async r => { entered(); await gate; await r.continue() }
      await page.route('**/api/admin/workstation-areas', handler)
      try {
        await page.getByRole('button', { name: mode === 'edit' ? '编辑' : '新增办公位', exact: true }).first().click()
        await started
        const d = dialog()
        const field = d.getByLabel('办公位编号', { exact: true }).last()
        if (mode === 'edit') assert.ok(await field.inputValue(), '区域接口尚未返回也应立即回填')
        await field.fill('E2E-慢网络输入')
        release()
        await page.waitForLoadState('networkidle')
        assert.equal(await field.inputValue(), 'E2E-慢网络输入')
        await discardDialog(d)
      } finally { release(); await page.unroute('**/api/admin/workstation-areas', handler) }
    })
    await test('需求审核通过并刷新', async () => {
      await visit('/demands/review')
      const row = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: '审核', exact: true }) }).first()
      const id = await row.locator('.demand-id').innerText()
      await row.getByRole('button', { name: '审核', exact: true }).click()
      const d = drawer()
      await submit(d, '通过', `/demands/${id}/approve`, 'POST')
      await d.waitFor({ state: 'hidden' })
      assert.equal((await api('/demands/' + id)).status, 'pending_release')
      await reload()
      assert.equal(await page.locator('tbody tr').filter({ hasText: id }).count(), 0)
      return { id, status: 'pending_release' }
    })
    await test('订单核销确认与刷新', async () => {
      await visit('/mall/orders')
      const row = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: '核销', exact: true }) }).first()
      const id = (await row.innerText()).match(/RO\d+/)[0]
      await row.getByRole('button', { name: '核销', exact: true }).click()
      await submit(page, '确认核销', `/redemption-orders/${id}/verify`, 'POST')
      await reload()
      assert.match(await page.locator('tbody tr').filter({ hasText: id }).innerText(), /已完成/)
      return { id }
    })
    await test('订单退款、积分和库存回补', async () => {
      await visit('/mall/orders')
      const row = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: '退款', exact: true }) }).first()
      const id = (await row.innerText()).match(/RO\d+/)[0]
      const order = (await api('/mall/redemption-orders?keyword=' + id)).list[0]
      const user = await api('/users/' + order.userId)
      const goods = (await api('/mall/goods?keyword=' + encodeURIComponent(order.goodsName))).list.find(x => x.id === order.goodsId)
      await row.getByRole('button', { name: '退款', exact: true }).click()
      await submit(page, '确认退款', `/redemption-orders/${id}/cancel`, 'POST')
      await reload()
      assert.match(await page.locator('tbody tr').filter({ hasText: id }).innerText(), /已取消/)
      const afterUser = await api('/users/' + order.userId)
      assert.equal(afterUser.points - user.points, Math.abs(order.points))
      const afterGoods = (await api('/mall/goods?keyword=' + encodeURIComponent(order.goodsName))).list.find(x => x.id === order.goodsId)
      assert.equal(afterGoods.stock, goods.stock + 1)
      return { id, pointsReturned: afterUser.points - user.points, stockRestored: true }
    })
    await test('订单归档与恢复', async () => {
      await visit('/mall/orders')
      const row = page.locator('tbody tr').filter({ has: page.getByRole('button', { name: '归档', exact: true }) }).first()
      const id = (await row.innerText()).match(/RO\d+/)[0]
      await row.getByRole('button', { name: '归档', exact: true }).click()
      await submit(page.locator('.t-popconfirm:visible'), '归档', `/redemption-orders/${id}/archive`, 'POST')
      await visit('/system/trash?activeDomain=order')
      const archived = page.locator('tbody tr').filter({ hasText: id })
      await archived.getByRole('button', { name: '恢复', exact: true }).click()
      await submit(page.locator('.t-popconfirm:visible'), '恢复', `/trash/order/${id}/restore`, 'POST')
      await visit('/mall/orders')
      assert.ok(await page.locator('tbody tr').filter({ hasText: id }).count())
      return { id }
    })
    await test('系统配置修改、保存和刷新', async () => {
      await visit('/system/config')
      const field = page.getByLabel('站点名称', { exact: true }).last()
      const value = '聚屿社区 E2E'
      await field.fill(value)
      await submit(page, '保存配置', '/system/config')
      await reload()
      assert.equal(await field.inputValue(), value)
      assert.ok(await page.getByRole('button', { name: '保存配置', exact: true }).isDisabled())
      return { persisted: true }
    })
    for (const [scope, label] of [['community_individual', '社区个体'], ['community_enterprise', '社区企业']]) await test(`${label}等级配置保存`, async () => {
      await visit('/rules/levels?scope=' + scope)
      await page.locator('.page-scroll .t-tabs__nav-item').filter({ hasText: label }).click()
      await page.waitForLoadState('networkidle')
      const field = page.getByLabel('1 级等级标签', { exact: true }).last()
      await field.fill('E2E一级')
      await submit(page, '保存' + label + '配置', '/rules/levels')
      await reload()
      assert.equal(await field.inputValue(), 'E2E一级')
      return { scope }
    })
    await test('个人用户额度保存与刷新', async () => {
      await visit('/rules/publishing-limits')
      const field = page.locator('input:visible').first()
      await field.fill('2')
      await field.blur()
      await submit(page, '保存规则', '/rules/publishing-limits')
      await reload()
      assert.equal(await field.inputValue(), '2')
    })
    await test('申请表单字段排序、跨类型草稿与保存', async () => {
      await visit('/system/application-form-config')
      const field = page.getByLabel('表单标题', { exact: true }).last()
      await field.fill('E2E申请表单')
      const first = await page.locator('.field-card h3').first().innerText()
      await page.locator('.field-card').first().getByRole('button', { name: '下移', exact: true }).click()
      assert.ok((await page.locator('.field-card h3').nth(1).innerText()).includes(first.slice(3)))
      const tabs = page.locator('.page-scroll .t-tabs__nav-item')
      await tabs.nth(1).click()
      await tabs.nth(0).click()
      assert.equal(await field.inputValue(), 'E2E申请表单')
      await submit(page, '保存配置', '/applications/form-configs/', 'POST')
      await reload()
      assert.equal(await field.inputValue(), 'E2E申请表单')
    })
    await test('租约编辑原因必填与记录持久化', async () => {
      await visit('/workstations/leases')
      const row = page.locator('tbody tr').filter({ hasText: '生效中' }).first()
      const id = (await row.innerText()).match(/LS\d+/)[0]
      await row.getByRole('button', { name: '更多', exact: true }).click()
      await page.locator('.row-more-actions:visible').getByRole('button', { name: '编辑', exact: true }).click()
      const d = dialog()
      await d.getByLabel('联系人', { exact: true }).last().waitFor()
      await d.getByRole('button', { name: '保存修改', exact: true }).click()
      await d.locator('[aria-invalid=true]').waitFor()
      await d.getByLabel('编辑原因', { exact: true }).last().fill('E2E隔离租约编辑')
      await d.getByLabel('联系人', { exact: true }).last().fill('E2E联系人')
      await submit(d, '保存修改', '/workstation-leases/' + id)
      await d.waitFor({ state: 'hidden' })
      const lease = await api('/workstation-leases/' + id)
      assert.equal(lease.contactName, 'E2E联系人')
      assert.ok(JSON.stringify(lease).includes('E2E隔离租约编辑'))
      return { id }
    })
  }
  if (group === 'routes') {
    /* 标签页标题后缀取「系统配置 → 站点信息」的站点名称（manifest 按内置默认名书写，运行时替换） */
    const siteName = (await api('/branding')).siteName
    for (const route of manifest) await test('登录态路由 ' + route.path, async () => {
      const before = runtimeErrors.length
      await visit(route.path)
      assert.equal(await page.title(), route.title.replace('聚屿社区', siteName))
      assert.equal(runtimeErrors.length, before)
      assert.equal(await page.locator('.page-scroll [role=alert]').filter({ hasText: '数据加载失败' }).count(), 0)
      return { path: route.path, title: await page.title() }
    })
  }
  if (group === 'tabs') {
    const tabs = JSON.parse(await readFile(new URL('./authenticated-tab-manifest.json', import.meta.url), 'utf8'))
    for (const tab of tabs) await test('选项卡 ' + tab.path + ' · ' + tab.label, async () => {
      await visit(tab.url.split('?')[0])
      // 当前 TDesign Tabs DOM 使用 nav-item 和 t-is-active 标识，不提供 role=tab。
      const control = page.locator('.page-scroll .t-tabs__nav-item:visible').filter({ has: page.getByText(tab.label, { exact: true }) }).first()
      await control.click()
      await page.waitForLoadState('networkidle')
      assert.match(await control.getAttribute('class'), /t-is-active/)
      return { path: tab.path, label: tab.label, url: new URL(page.url()).hash.slice(1) }
    })
  }
  if (group === 'recovery') {
    for (const route of manifest.filter(r => r.primaryApi)) await test('加载失败及重试 ' + route.path, async () => {
      let failed = false
      const handler = async r => {
        if (new URL(r.request().url()).pathname !== route.primaryApi) return r.continue()
        if (!failed) {
          failed = true
          return r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 503, message: 'E2E受控暂时不可用' }) })
        }
        await r.continue()
      }
      await page.route('**/api/admin/**', handler)
      try {
        await visit(route.path)
        assert.ok(failed, '必须命中该页主数据请求')
        const alert = page.locator('[role=alert]:visible').filter({ hasText: 'E2E受控暂时不可用' }).first()
        await alert.waitFor()
        const response = page.waitForResponse(r => new URL(r.url()).pathname === route.primaryApi && r.status() === 200)
        await Promise.all([response, alert.getByRole('button', { name: '重新加载', exact: true }).click()])
        await alert.waitFor({ state: 'hidden' })
        await page.waitForLoadState('networkidle')
        return { path: route.path, api: route.primaryApi, injected: 503, recovered: 200 }
      } finally { await page.unroute('**/api/admin/**', handler) }
    })
  }
  if (group === 'interaction') {
    await test('列显隐、顺序持久化和Escape关闭', async () => {
      await visit('/users')
      await page.getByRole('button', { name: '列设置', exact: true }).click()
      const panel = page.locator('.col-panel:visible')
      const check = panel.locator('input[type=checkbox]:not([disabled])').first()
      const row = check.locator('xpath=ancestor::div[contains(@class,"col-row")]')
      const label = (await row.locator('.col-check').innerText()).trim()
      await row.locator('.col-check').click()
      assert.equal(await check.isChecked(), false)
      await row.getByRole('button', { name: '下移' + label, exact: true }).click()
      const saved = await page.evaluate(() => localStorage.getItem('joinyuu_cols_users'))
      assert.ok(saved)
      await page.keyboard.press('Escape')
      await panel.waitFor({ state: 'hidden' })
      await reload()
      assert.equal(await page.locator('thead').getByText(label, { exact: true }).count(), 0)
      assert.equal(await page.evaluate(() => localStorage.getItem('joinyuu_cols_users')), saved)
      await page.getByRole('button', { name: '列设置', exact: true }).click()
      await panel.getByRole('button', { name: '重置', exact: true }).click()
      await page.locator('.t-popconfirm:visible').getByRole('button', { name: '重置', exact: true }).click()
      await page.keyboard.press('Escape')
      await page.locator('thead').getByText(label, { exact: true }).waitFor()
      return { hiddenAndMovedColumn: label }
    })
    await test('行更多操作键盘打开、首项焦点和Escape返回', async () => {
      await visit('/workstations/leases')
      const trigger = page.getByRole('button', { name: '更多', exact: true }).first()
      await trigger.focus()
      await page.keyboard.press('Enter')
      const panel = page.locator('.row-more-actions:visible')
      await panel.waitFor()
      await page.waitForFunction(() => document.querySelector('.row-more-actions')?.contains(document.activeElement))
      await page.keyboard.press('Escape')
      await panel.waitFor({ state: 'hidden' })
      assert.ok(await trigger.evaluate(e => e === document.activeElement))
    })
    for (const width of [1024, 375]) await test(`${width}px列表和审核抽屉布局`, async () => {
      await page.setViewportSize({ width, height: 900 })
      try {
        for (const path of ['/users', '/mall/orders', '/assets/library', '/system/config']) {
          await visit(path)
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), path + '文档横向溢出')
        }
        await visit('/demands/review')
        await page.getByRole('button', { name: '审核', exact: true }).first().click()
        const d = drawer()
        await d.waitFor()
        await page.waitForFunction(() => {
          const r = [...document.querySelectorAll('.t-drawer__content-wrapper')].find(e => e.getBoundingClientRect().height > 0)?.getBoundingClientRect()
          return r && r.x >= -1 && r.right <= innerWidth + 1
        })
        const bounds = await d.boundingBox()
        assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= width + 1)
        await d.getByRole('button', { name: '通过', exact: true }).waitFor()
        await page.screenshot({ path: out + `drawer-${width}.png` })
        return { width, drawerWidth: bounds.width, documentOverflow: false }
      } finally { await page.setViewportSize({ width: 1440, height: 1000 }) }
    })
    for (const path of ['/prints/lease/LS2008', '/prints/approval/AP3024']) await test('打印样式与PDF输出 ' + path, async () => {
      await visit(path)
      await page.emulateMedia({ media: 'print' })
      try {
        assert.equal(await page.getByRole('button', { name: '打印', exact: true }).isVisible(), false)
        assert.ok((await page.locator('body').innerText()).includes(path.includes('lease') ? '租赁信息' : '申请内容'))
        const pdf = await page.pdf({ path: out + path.replaceAll('/', '-') + '.pdf', format: 'A4', printBackground: true })
        assert.ok(pdf.length > 5000)
        return { path, pdfBytes: pdf.length }
      } finally { await page.emulateMedia({ media: 'screen' }) }
    })
    await test('管理员重置密码输入掩码', async () => {
      await visit('/system/account?activeTab=admins')
      await page.getByRole('button', { name: '重置密码', exact: true }).first().click()
      const d = dialog()
      for (const label of ['新密码', '确认新密码']) {
        const input = d.getByLabel(label, { exact: true }).last()
        assert.equal(await input.getAttribute('type'), 'password')
        assert.equal(await input.getAttribute('autocomplete'), 'new-password')
      }
      await d.getByRole('button', { name: '取消', exact: true }).click()
    })
    await test('消息模板真实预览', async () => {
      await visit('/system/messages?tab=templates')
      await page.getByRole('button', { name: '编辑', exact: true }).first().click()
      const d = dialog()
      await d.getByRole('button', { name: '预览', exact: true }).waitFor()
      const response = page.waitForResponse(r => r.url().includes('/preview') && r.request().method() === 'POST')
      const [r] = await Promise.all([response, d.getByRole('button', { name: '预览', exact: true }).click()])
      assert.equal(r.status(), 200)
      const preview = page.locator('.t-dialog:visible').filter({ hasText: '模板预览' })
      await preview.locator('.preview-body').waitFor()
      assert.ok((await preview.locator('.preview-body').innerText()).length > 0)
      return { previewApi: 200, externalSend: false }
    })
    await test('新测试角色权限与数据范围保存', async () => {
      await visit('/system/account?tab=roles')
      const code = 'e2e_' + Date.now()
      await page.getByRole('button', { name: '新增角色', exact: true }).click()
      const d = dialog()
      await d.getByLabel('角色编码', { exact: true }).last().fill(code)
      await d.getByLabel('角色名称', { exact: true }).last().fill('E2E隔离测试角色')
      await submit(d, '保存', '/roles', 'POST')
      await d.waitFor({ state: 'hidden' })
      const role = (await api('/roles')).find(r => r.code === code)
      assert.ok(role)
      await page.locator('tbody tr').filter({ hasText: code }).getByRole('button', { name: '权限配置', exact: true }).click()
      const assign = dialog()
      const permission = assign.locator('.perm-group:not(.scope-group) .perm-list .t-checkbox').first()
      const scope = assign.locator('.scope-group .t-checkbox').first()
      await permission.click()
      await scope.click()
      await submit(assign, '保存', '/roles/' + role.id + '/assignment')
      await assign.waitFor({ state: 'hidden' })
      await reload()
      const updated = (await api('/roles')).find(r => r.id === role.id)
      assert.equal(updated.permCodes.length, 1)
      assert.equal(updated.dataScope.length, 1)
      return { code, permissions: updated.permCodes, dataScope: updated.dataScope }
    })
    await test('新测试素材上传、真实图片加载和删除', async () => {
      await visit('/assets/library')
      const fileName = 'E2E-isolated-' + Date.now() + '.png'
      const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/assets' && r.request().method() === 'POST')
      const [r] = await Promise.all([response, page.locator('input[type=file]').first().setInputFiles({ name: fileName, mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') })])
      assert.equal(r.status(), 200)
      const asset = (await r.json()).data
      const card = page.locator('.asset-card').filter({ hasText: fileName })
      await card.waitFor()
      await card.scrollIntoViewIfNeeded()
      await page.waitForFunction(name => [...document.images].some(i => i.alt === name && i.complete && i.naturalWidth > 0), fileName)
      assert.equal((await context.request.get(new URL(asset.url, base).href)).status(), 200)
      await card.getByRole('button', { name: '删除', exact: true }).click()
      await submit(page.locator('.t-popconfirm:visible'), '删除', '/assets/' + asset.id, 'DELETE')
      await card.waitFor({ state: 'hidden' })
      assert.ok(!(await api('/assets')).some(a => a.id === asset.id))
      return { id: asset.id, onlyNewFixtureDeleted: true }
    })
    await test('租约续期校验和续期记录持久化', async () => {
      await visit('/workstations/leases')
      const row = page.locator('tbody tr').filter({ hasText: '已到期' }).first()
      const id = (await row.innerText()).match(/LS\d+/)[0]
      const before = await api('/workstation-leases/' + id)
      await row.getByRole('button', { name: '更多', exact: true }).click()
      await page.locator('.row-more-actions:visible').getByRole('button', { name: '续期', exact: true }).click()
      const d = dialog()
      await d.getByRole('button', { name: '确认续期', exact: true }).click()
      await d.locator('[aria-invalid=true]').waitFor()
      await d.getByLabel('续期说明', { exact: true }).last().fill('E2E隔离续期')
      await submit(d, '确认续期', '/workstation-leases/' + id + '/renew', 'POST')
      await d.waitFor({ state: 'hidden' })
      const lease = await api('/workstation-leases/' + id)
      assert.ok(lease.endDate > before.endDate)
      assert.ok(JSON.stringify(lease).includes('E2E隔离续期'))
      await reload()
      assert.match(await page.locator('tbody tr').filter({ hasText: id }).innerText(), /生效中/)
      return { id, previousEnd: before.endDate, newEnd: lease.endDate }
    })
  }
  if (group === 'security') {
    for (const username of ['operator', 'auditor']) await test(username + '真实登录、菜单和越权拦截', async () => {
      const c = await browser.newContext()
      const p = await c.newPage()
      try {
        await login(p, username)
        const perms = await p.evaluate(() => JSON.parse(localStorage.getItem('joinyuu_admin_perm_codes')))
        assert.ok(!perms.includes('*'))
        await p.goto(base + '/#/system/config')
        await p.waitForURL(/#\/403/)
        assert.equal(await p.getByRole('button', { name: '保存配置', exact: true }).count(), 0)
        const t = await p.evaluate(() => localStorage.getItem('joinyuu_admin_token'))
        const denied = await c.request.get(base + '/api/admin/system/config', { headers: { Authorization: 'Bearer ' + t } })
        assert.equal(denied.status(), 403)
        return { role: username, route: '403', api: 403 }
      } finally { await c.close() }
    })
    await test('会话强制下线触发401、清缓存和回登录', async () => {
      const c = await browser.newContext()
      const p = await c.newPage()
      try {
        await login(p)
        const t = await p.evaluate(() => localStorage.getItem('joinyuu_admin_token'))
        const jti = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).jti
        await api('/auth/sessions/' + jti + '/kick', { method: 'POST' })
        await p.goto(base + '/#/users')
        await p.waitForURL(/#\/login/)
        assert.equal(await p.evaluate(() => localStorage.getItem('joinyuu_admin_token')), null)
        return { realRevokedSession: true }
      } finally { await c.close() }
    })
    await test('退出登录和受保护直达', async () => {
      await visit('/dashboard')
      await page.getByRole('button', { name: '管理员菜单', exact: true }).click()
      const response = page.waitForResponse(r => r.url().endsWith('/auth/logout'))
      await page.getByText('退出登录', { exact: true }).click()
      assert.equal((await response).status(), 200)
      await page.waitForURL(/#\/login/)
      assert.equal(await page.evaluate(() => localStorage.getItem('joinyuu_admin_token')), null)
      await page.goto(base + '/#/users/U1001')
      await page.waitForURL(/#\/login/)
    })
  }
} finally {
  await save()
  await browser.close()
}
process.exitCode = records.some(r => !r.pass) ? 1 : 0
