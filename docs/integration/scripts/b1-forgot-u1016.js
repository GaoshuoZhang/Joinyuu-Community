async page => {
  const out = { steps: [] }
  let resetCount = 0
  page.on('request', r => {
    if (r.url().includes('/api/app/auth/reset-password')) resetCount++
  })
  async function clearToken() {
    await page.evaluate(() => {
      localStorage.removeItem('joinyuu_client_token')
      localStorage.removeItem('joinyuu_client_identity')
    })
  }
  async function readCaptcha() {
    const src = await page.locator('img[alt="图形验证码"]').first().getAttribute('src')
    const svg = decodeURIComponent(String(src).replace(/^data:image\/svg\+xml;utf8,/, ''))
    return [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/g)].map(m => m[1]).join('')
  }
  async function fillForm(phone, pwd) {
    await page.getByRole('textbox', { name: '请输入注册手机号…' }).fill(phone)
    await page.getByRole('textbox', { name: '请输入验证码…' }).fill(await readCaptcha())
    await page.getByRole('textbox', { name: '至少 8 位，含字母与数字…' }).fill(pwd)
    await page.getByRole('textbox', { name: '再次输入新密码…' }).fill(pwd)
  }

  await clearToken()
  await page.goto('http://localhost:7759/forgot-password')
  await page.waitForTimeout(800)

  const beforeWeak = resetCount
  await fillForm('13900001234', '123')
  await page.getByRole('button', { name: '重置密码' }).click()
  await page.waitForTimeout(500)
  const weakText = await page.locator('body').innerText()
  out.steps.push({ step: 'weak-password', requestSent: resetCount > beforeWeak, uiError: weakText.includes('至少 8 位') })

  await page.getByRole('button', { name: '刷新验证码' }).first().click()
  await page.waitForTimeout(500)
  await fillForm('13900009999', 'Secret123')
  const respPromise = page.waitForResponse(r => r.url().includes('/api/app/auth/reset-password'))
  await page.getByRole('button', { name: '重置密码' }).click()
  const resp = await respPromise
  const statusBody = { status: resp.status(), body: (await resp.text()).slice(0, 80) }
  await page.waitForTimeout(250)
  let toastText = ''
  try {
    toastText = (await page.locator('body').innerText()).split('\n').filter(x => x.includes('未注册')).join(' | ')
  } catch {
    toastText = 'n/a'
  }
  await page.waitForTimeout(800)
  out.steps.push({ step: 'unknown-phone', ...statusBody, toastText, urlAfter: page.url() })

  await clearToken()
  await page.goto('http://localhost:7759/forgot-password')
  await page.waitForTimeout(800)
  await fillForm('13900001234', 'Secret123')
  const okPromise = page.waitForResponse(r => r.url().includes('/api/app/auth/reset-password'))
  await page.getByRole('button', { name: '重置密码' }).click()
  const okResp = await okPromise
  out.steps.push({ step: 'reset-ok', status: okResp.status(), body: (await okResp.text()).slice(0, 80) })
  await page.waitForTimeout(1000)
  out.finalUrl = page.url()
  return JSON.stringify(out)
}
