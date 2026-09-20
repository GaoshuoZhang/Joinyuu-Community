async page => {
  const out = { steps: [] }
  let registerCount = 0
  page.on('request', r => {
    if (r.url().includes('/api/app/auth/register')) registerCount++
  })
  await page.evaluate(() => {
    localStorage.removeItem('joinyuu_client_token')
    localStorage.removeItem('joinyuu_client_identity')
  })
  await page.goto('http://localhost:7759/register')
  await page.waitForTimeout(900)
  async function readCaptcha() {
    const src = await page.locator('img[alt="图形验证码"]').first().getAttribute('src')
    const svg = decodeURIComponent(String(src).replace(/^data:image\/svg\+xml;utf8,/, ''))
    return [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/g)].map(m => m[1]).join('')
  }
  await page.getByRole('textbox', { name: '请输入昵称…' }).fill('重复号测试')
  await page.getByRole('textbox', { name: '请输入手机号…' }).fill('13801210001')
  await page.getByRole('textbox', { name: '密码（至少 8 位，含字母与数字）…' }).fill('user1234')
  await page.getByRole('textbox', { name: '请再次输入密码…' }).fill('user1234')
  await page.getByRole('textbox', { name: '请输入验证码…' }).fill(await readCaptcha())
  const before = registerCount
  await page.getByRole('button', { name: '注 册' }).click()
  await page.waitForTimeout(600)
  const text1 = await page.locator('body').innerText()
  out.steps.push({
    step: 'no-agreement',
    requestSent: registerCount > before,
    uiErrorLines: text1.split('\n').filter(x => x.includes('同意') || x.includes('协议')).join(' | '),
  })
  await page.locator('.agreement .t-checkbox').first().click()
  await page.waitForTimeout(300)
  const respPromise = page.waitForResponse(r => r.url().includes('/api/app/auth/register'))
  await page.getByRole('button', { name: '注 册' }).click()
  const resp = await respPromise
  out.steps.push({ step: 'duplicate-phone', status: resp.status(), body: (await resp.text()).slice(0, 80) })
  await page.waitForTimeout(600)
  const text2 = await page.locator('body').innerText()
  out.steps.push({ step: 'duplicate-toast', uiLines: text2.split('\n').filter(x => x.includes('已注册')).join(' | ') })
  return JSON.stringify(out)
}
