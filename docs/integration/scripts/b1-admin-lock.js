async page => {
  const out = []
  await page.evaluate(() => localStorage.removeItem('joinyuu_admin_token'))
  await page.goto('http://localhost:7758/#/login')
  await page.waitForTimeout(800)
  await page.getByRole('textbox', { name: '请输入用户名…' }).fill('auditor')

  async function currentCaptcha() {
    const src = await page.locator('img[alt="验证码"]').first().getAttribute('src')
    const svg = decodeURIComponent(String(src).replace(/^data:image\/svg\+xml;utf8,/, ''))
    return [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/g)].map(m => m[1]).join('')
  }

  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(500)
    const code = await currentCaptcha()
    await page.getByRole('textbox', { name: '请输入密码…' }).fill('wrong-password')
    await page.getByRole('textbox', { name: '验证码…' }).fill(code)
    const loginPromise = page.waitForResponse(r => r.url().includes('/api/admin/auth/login'))
    await page.getByRole('button', { name: '登 录' }).click()
    const loginResp = await loginPromise
    out.push({ attempt: i + 1, status: loginResp.status(), body: (await loginResp.text()).slice(0, 90) })
  }

  await page.waitForTimeout(500)
  const code6 = await currentCaptcha()
  await page.getByRole('textbox', { name: '请输入密码…' }).fill('admin123')
  await page.getByRole('textbox', { name: '验证码…' }).fill(code6)
  const loginPromise = page.waitForResponse(r => r.url().includes('/api/admin/auth/login'))
  await page.getByRole('button', { name: '登 录' }).click()
  const loginResp = await loginPromise
  out.push({ attempt: 6, correctPassword: true, status: loginResp.status(), body: (await loginResp.text()).slice(0, 90) })
  await page.waitForTimeout(400)
  const body = await page.locator('body').innerText()
  out.push({ uiToast: body.split('\n').filter(x => x.includes('登录失败次数过多')).join(' | ') })
  return JSON.stringify(out)
}
