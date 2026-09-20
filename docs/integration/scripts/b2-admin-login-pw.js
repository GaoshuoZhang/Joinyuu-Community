async page => {
  await page.evaluate(() => localStorage.removeItem('joinyuu_admin_token'))
  await page.goto('http://localhost:7758/#/login')
  await page.waitForTimeout(800)
  const src = await page.locator('img[alt="验证码"]').first().getAttribute('src')
  const svg = decodeURIComponent(String(src).replace(/^data:image\/svg\+xml;utf8,/, ''))
  const code = [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/g)].map(m => m[1]).join('')
  await page.getByRole('textbox', { name: '请输入用户名…' }).fill('__USERNAME__')
  await page.getByRole('textbox', { name: '请输入密码…' }).fill('__PASSWORD__')
  await page.getByRole('textbox', { name: '验证码…' }).fill(code)
  const loginPromise = page.waitForResponse(r => r.url().includes('/api/admin/auth/login'))
  await page.getByRole('button', { name: '登 录' }).click()
  const loginResp = await loginPromise
  await page.waitForTimeout(1000)
  return JSON.stringify({ status: loginResp.status(), body: (await loginResp.text()).slice(0, 90), url: page.url() })
}
