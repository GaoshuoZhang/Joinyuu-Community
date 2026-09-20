async page => {
  await page.evaluate(() => {
    localStorage.removeItem('joinyuu_client_token')
    localStorage.removeItem('joinyuu_client_identity')
  })
  await page.goto('http://localhost:7759/login')
  await page.waitForTimeout(900)
  const src = await page.locator('img[alt="图形验证码"]').first().getAttribute('src')
  const svg = decodeURIComponent(String(src).replace(/^data:image\/svg\+xml;utf8,/, ''))
  const code = [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/g)].map(m => m[1]).join('')
  await page.getByRole('textbox', { name: '请输入手机号…' }).fill('__PHONE__')
  await page.getByRole('textbox', { name: '请输入密码…' }).fill('__PASSWORD__')
  await page.getByRole('textbox', { name: '请输入验证码…' }).fill(code)
  const loginPromise = page.waitForResponse(r => r.url().includes('/api/app/auth/login'))
  await page.getByRole('button', { name: '登录' }).click()
  const loginResp = await loginPromise
  await page.waitForTimeout(900)
  return JSON.stringify({ status: loginResp.status(), url: page.url(), body: (await loginResp.text()).slice(0, 60) })
}
