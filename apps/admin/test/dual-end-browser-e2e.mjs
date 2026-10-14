import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const require = createRequire(process.env.PLAYWRIGHT_PACKAGE || 'C:/Users/Gaoshuo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')
const { chromium } = require('playwright')
const adminBase = process.env.ADMIN_BROWSER_URL || 'http://127.0.0.1:7758'
const mobileBase = process.env.MOBILE_BROWSER_URL || 'http://127.0.0.1:7759'
assert.equal(new URL(adminBase).port, '7758')
assert.equal(new URL(mobileBase).port, '7759')
const artifactDir = fileURLToPath(new URL('./artifacts/dual-end-20261015/', import.meta.url))
await mkdir(artifactDir, { recursive: true })

const adminRoutes = JSON.parse(await readFile(new URL('./authenticated-route-manifest.json', import.meta.url), 'utf8'))
const adminTabs = JSON.parse(await readFile(new URL('./authenticated-tab-manifest.json', import.meta.url), 'utf8'))
const mobileRoutes = [
  '/', '/search', '/projects', '/community', '/plaza', '/me', '/me/stats', '/me/messages',
  '/demands/new', '/demands/new/task', '/demands/new/invest', '/demands/new/cooperation', '/demands/D4028',
  '/intros/enterprise', '/intros/settle', '/intros/cooperation', '/intros/talent', '/events/EV6013',
  '/events/EV6013/check-in', '/mall', '/mall/rules', '/mall/G1001', '/spaces', '/spaces/S1001/reserve',
  '/articles', '/articles/new', '/articles/A1010', '/talents/U1001', '/enterprises/E2001', '/notices',
  '/me/cards/individual', '/me/identities', '/me/enterprises/E2001', '/me/enterprises/E2001/edit',
  '/me/enterprises/E2001/members/U1001', '/me/profile/edit', '/me/realname', '/me/points', '/me/experience',
  '/me/demands', '/me/responses', '/me/enrollments', '/me/orders', '/me/orders/RO2012', '/me/reservations',
  '/me/reservations/SR2001', '/me/leases', '/me/articles', '/me/articles/A1010', '/me/favorites', '/me/history',
  '/me/security', '/me/records', '/me/settings', '/me/notification-settings', '/privacy', '/me/applications',
  '/me/applications/AP3018', '/me/projects', '/me/projects/P5011', '/applications/settle',
  '/applications/cooperation', '/applications/individual',
]

const groups = {}
const allErrors = []
function makeGroup(name) {
  const group = { records: [], pageErrors: [], requestFailures: [], serverResponses: [] }
  groups[name] = group
  return group
}
async function record(group, name, fn) {
  try {
    const data = await fn()
    group.records.push({ name, pass: true, data: data ?? null })
    console.log('PASS', name)
    return data
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    group.records.push({ name, pass: false, error: message })
    allErrors.push({ group: Object.entries(groups).find(([, value]) => value === group)?.[0], name, error: message })
    console.log('FAIL', name, message.split('\n')[0])
    return null
  }
}

function attachDiagnostics(page, group, label) {
  page.on('pageerror', error => group.pageErrors.push({ label, message: error.message }))
  page.on('requestfailed', request => group.requestFailures.push({ label, url: request.url(), failure: request.failure()?.errorText }))
  page.on('response', response => {
    if (response.status() >= 500) group.serverResponses.push({ label, url: response.url(), status: response.status() })
  })
}

function captchaCode(dataUrl) {
  const payload = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const svg = dataUrl.includes(';base64,') ? Buffer.from(payload, 'base64').toString() : decodeURIComponent(payload)
  const code = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map(match => match[1]).join('')
  assert.equal(code.length, 4, '验证码应包含 4 位字符')
  return code
}

async function waitForApp(page) {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => document.querySelector('#app')?.textContent?.trim().length > 12, null, { timeout: 15000 })
  await page.waitForLoadState('networkidle').catch(() => {})
}

async function adminLogin(page) {
  await page.goto(adminBase + '/#/login')
  await page.getByAltText('验证码', { exact: true }).waitFor()
  const code = captchaCode(await page.getByAltText('验证码', { exact: true }).getAttribute('src'))
  await page.getByLabel('用户名', { exact: true }).last().fill('admin')
  await page.getByLabel('密码', { exact: true }).last().fill(process.env.ADMIN_E2E_PASSWORD || 'admin123')
  await page.getByLabel('图形验证码', { exact: true }).last().fill(code)
  await page.getByRole('button', { name: '登 录', exact: true }).click()
  await page.waitForURL(/#\/dashboard/)
  await waitForApp(page)
}

async function mobileLogin(page) {
  await page.goto(mobileBase + '/login')
  await page.locator('img[alt="图形验证码"]').waitFor()
  const code = captchaCode(await page.locator('img[alt="图形验证码"]').getAttribute('src'))
  const identifier = page.locator('input[autocomplete="username"]')
  await identifier.fill(process.env.MOBILE_E2E_IDENTIFIER || '13801210001')
  await page.locator('input[autocomplete="current-password"]').fill(process.env.MOBILE_E2E_PASSWORD || 'user123')
  await page.getByPlaceholder('请输入验证码…', { exact: true }).fill(code)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL(mobileBase + '/')
  await waitForApp(page)
}

const browser = await chromium.launch({ headless: true })
const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true })
const adminPage = await adminContext.newPage()
const mobilePage = await mobileContext.newPage()
adminPage.setDefaultTimeout(10000)
mobilePage.setDefaultTimeout(10000)
const adminGroup = makeGroup('admin-routes')
const adminTabsGroup = makeGroup('admin-tabs')
const mobileGroup = makeGroup('mobile-routes')
const interactionGroup = makeGroup('cross-end-interactions')
attachDiagnostics(adminPage, adminGroup, 'admin')
attachDiagnostics(adminPage, adminTabsGroup, 'admin-tabs')
attachDiagnostics(mobilePage, mobileGroup, 'mobile')
attachDiagnostics(mobilePage, interactionGroup, 'mobile-interaction')

try {
  await record(adminGroup, 'Admin 真实验证码登录', async () => {
    await adminLogin(adminPage)
    assert.equal(await adminPage.evaluate(() => Boolean(localStorage.getItem('joinyuu_admin_token'))), true)
    return { url: adminPage.url(), title: await adminPage.title() }
  })
  assert.ok(adminGroup.records.at(-1).pass, 'Admin 登录失败，停止依赖登录态的测试')

  for (const route of adminRoutes) {
    await record(adminGroup, `Admin 路由 ${route.path}`, async () => {
      await adminPage.goto(adminBase + '/?browserE2E=' + encodeURIComponent(route.path) + '#' + route.path)
      await waitForApp(adminPage)
      assert.equal(await adminPage.title(), route.title)
      assert.equal(await adminPage.locator('[role=alert]:visible').filter({ hasText: '数据加载失败' }).count(), 0)
      if (!route.path.startsWith('/prints/')) assert.equal(await adminPage.locator('.page-scroll').count(), 1)
      return { path: route.path, title: await adminPage.title() }
    })
  }

  for (const tab of adminTabs) {
    await record(adminTabsGroup, `Admin 选项卡 ${tab.path} · ${tab.label}`, async () => {
      await adminPage.goto(adminBase + '/?browserE2ETab=' + encodeURIComponent(tab.label) + '#' + tab.url.split('?')[0])
      await waitForApp(adminPage)
      const control = adminPage.locator('.page-scroll .t-tabs__nav-item:visible').filter({ hasText: tab.label }).first()
      await control.waitFor()
      await control.click()
      await adminPage.waitForLoadState('networkidle').catch(() => {})
      assert.match(await control.getAttribute('class'), /t-is-active/)
      return { path: tab.path, label: tab.label, url: new URL(adminPage.url()).hash }
    })
  }

  await record(interactionGroup, 'Admin 关键业务表单空提交与取消', async () => {
    await adminPage.goto(adminBase + '/#/users')
    await waitForApp(adminPage)
    const addButton = adminPage.getByRole('button', { name: /新增用户/ }).first()
    if (await addButton.count()) {
      await addButton.click()
      const dialog = adminPage.locator('.t-dialog:visible').last()
      await dialog.getByRole('button', { name: '确认新增', exact: true }).click()
      assert.ok(await dialog.locator('[aria-invalid="true"]').count() > 0 || await dialog.getByText(/请输入|必填/).count() > 0)
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
      await dialog.waitFor({ state: 'hidden' })
    }
    return { validated: true }
  })

  await record(mobileGroup, '移动端真实验证码登录', async () => {
    await mobileLogin(mobilePage)
    assert.equal(await mobilePage.evaluate(() => Boolean(localStorage.getItem('joinyuu_client_token'))), true)
    return { url: mobilePage.url(), title: await mobilePage.title() }
  })
  assert.ok(mobileGroup.records.at(-1).pass, 'Mobile 登录失败，停止依赖登录态的测试')

  for (const route of mobileRoutes) {
    await record(mobileGroup, `Mobile 路由 ${route}`, async () => {
      await mobilePage.goto(mobileBase + route)
      await waitForApp(mobilePage)
      assert.equal(await mobilePage.locator('#app').innerText().then(text => text.trim().length > 12), true)
      assert.equal(await mobilePage.getByText(/页面加载失败|请求失败|服务异常/).count(), 0)
      assert.equal(await mobilePage.locator('body').evaluate(node => node.scrollWidth <= window.innerWidth + 1), true)
      return { path: route, url: mobilePage.url() }
    })
  }

  await record(interactionGroup, '移动端底部导航与筛选输入保留', async () => {
    await mobilePage.goto(mobileBase + '/projects')
    await waitForApp(mobilePage)
    const navLabels = ['首页', '需求', '社区', '广场', '我的']
    for (const label of navLabels) {
      const control = mobilePage.locator('.t-tab-bar-item').filter({ hasText: label }).first()
      await control.waitFor()
      await control.click()
      await mobilePage.waitForLoadState('networkidle').catch(() => {})
      if (label === '首页') await mobilePage.waitForURL(mobileBase + '/')
      if (label === '需求') await mobilePage.waitForURL(mobileBase + '/projects')
      if (label === '社区') await mobilePage.waitForURL(mobileBase + '/community')
      if (label === '广场') await mobilePage.waitForURL(mobileBase + '/plaza')
      if (label === '我的') await mobilePage.waitForURL(mobileBase + '/me')
    }
    await mobilePage.goto(mobileBase + '/search')
    await waitForApp(mobilePage)
    const input = mobilePage.getByPlaceholder('输入关键词后搜索…', { exact: true })
    await input.fill('星澜')
    await mobilePage.waitForFunction(() => new URL(location.href).searchParams.get('q') === '星澜')
    await mobilePage.reload()
    await waitForApp(mobilePage)
    assert.equal(await mobilePage.getByPlaceholder('输入关键词后搜索…', { exact: true }).inputValue(), '星澜')
    return { tabsChecked: navLabels.length, searchPreserved: true }
  })

  await record(interactionGroup, '移动端需求、文章、预约表单校验与离开保护', async () => {
    await mobilePage.goto(mobileBase + '/demands/new/task')
    await waitForApp(mobilePage)
    await mobilePage.getByRole('button', { name: '提交需求', exact: true }).click()
    await mobilePage.locator('.field-error').filter({ hasText: '请输入需求标题' }).waitFor()

    await mobilePage.goto(mobileBase + '/articles/new')
    await waitForApp(mobilePage)
    await mobilePage.getByRole('button', { name: '提交投稿', exact: true }).click()
    await mobilePage.locator('.field-error').filter({ hasText: '请输入文章标题' }).waitFor()

    await mobilePage.goto(mobileBase + '/spaces/S1001/reserve')
    await waitForApp(mobilePage)
    await mobilePage.getByRole('button', { name: /提交预约/ }).click()
    await mobilePage.waitForTimeout(500)
    const reservationFormText = await mobilePage.locator('.reserve-form').innerText()
    assert.match(reservationFormText, /请选择完整的预约时段/, `预约表单未显示时段校验：${reservationFormText}`)

    await mobilePage.goto(mobileBase + '/demands/new/task')
    await waitForApp(mobilePage)
    const title = mobilePage.getByPlaceholder('一句话描述你的需求', { exact: true })
    await title.fill('联调未提交草稿')
    await mobilePage.locator('.t-navbar__left').click()
    const guard = mobilePage.getByText('离开当前页面？', { exact: true })
    await guard.waitFor()
    await mobilePage.getByRole('button', { name: '继续编辑', exact: true }).click()
    assert.match(new URL(mobilePage.url()).pathname, /demands\/new\/task$/)
    return { formsVisited: 3, submissions: 0, unsavedGuard: 'cancel keeps form open' }
  })

  await record(interactionGroup, '双端会话隔离与游客保护', async () => {
    const guest = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
    const page = await guest.newPage()
    try {
      await page.goto(mobileBase + '/me')
      await page.waitForURL(/\/login\?redirect=/)
      assert.equal(await page.locator('input[autocomplete="username"]').count(), 1)
      return { protectedRouteRedirected: true }
    } finally { await guest.close() }
  })
} finally {
  const output = {
    date: '2026-10-15',
    environment: { adminBase, mobileBase, database: 'apps/api/.env → joinyuu', browser: 'Playwright Chromium', currentDatabase: true },
    groups,
    totals: {
      records: Object.values(groups).reduce((sum, group) => sum + group.records.length, 0),
      passed: Object.values(groups).reduce((sum, group) => sum + group.records.filter(record => record.pass).length, 0),
      failed: Object.values(groups).reduce((sum, group) => sum + group.records.filter(record => !record.pass).length, 0),
      pageErrors: Object.values(groups).reduce((sum, group) => sum + group.pageErrors.length, 0),
      requestFailures: Object.values(groups).reduce((sum, group) => sum + group.requestFailures.length, 0),
      serverResponses: Object.values(groups).reduce((sum, group) => sum + group.serverResponses.length, 0),
    },
    errors: allErrors,
  }
  await writeFile(artifactDir + 'dual-end-results.json', JSON.stringify(output, null, 2))
  await adminContext.close()
  await mobileContext.close()
  await browser.close()
  console.log(JSON.stringify(output.totals))
}
process.exitCode = allErrors.length ? 1 : 0
