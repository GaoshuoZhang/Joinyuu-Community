async page => {
  const out = { steps: [] }
  let registerCount = 0
  page.on('request', r => {
    if (r.url().includes('/api/app/auth/register')) registerCount++
  })
  await page.goto('http://localhost:7759/register')
  await page.waitForTimeout(900)

  async function readCaptcha() {
    const src = await page.locator('img[alt="图形验证码"]').first().getAttribute('src')
    const svg = decodeURIComponent(String(src).replace(/^data:image\/svg\+xml;utf8,/, ''))
    return [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/g)].map(m => m[1]).join('')
  }
  async function fillForm(phone) {
    await page.getByRole('textbox', { name: '请输入昵称…' }).fill('联调小屿')
    await page.getByRole('textbox', { name: '请输入手机号…' }).fill(phone)
    await page.getByRole('textbox', { name: '密码（至少 8 位，含字母与数字）…' }).fill('user1234')
    await page.getByRole('textbox', { name: '请再次输入密码…' }).fill('user1234')
  }

  await fillForm('13900001234')
  const beforeNoAgree = registerCount
  await page.getByRole('button', { name: '注 册' }).click()
  await page.waitForTimeout(600)
  const noAgreeText = await page.locator('body').innerText()
  out.steps.push({
    step: 'no-agreement',
    requestSent: registerCount > beforeNoAgree,
    uiError: noAgreeText.split('\n').filter(x => x.includes('同意')).join(' | '),
  })

  await page.locator('.agreement .t-checkbox').first().click()
  await page.getByRole('textbox', { name: '请输入验证码…' }).fill('0000')
  let respPromise = page.waitForResponse(r => r.url().includes('/api/app/auth/register'))
  await page.getByRole('button', { name: '注 册' }).click()
  let resp = await respPromise
  out.steps.push({ step: 'wrong-captcha', status: resp.status(), body: (await resp.text()).slice(0, 80) })

  await page.waitForTimeout(900)
  await page.getByRole('textbox', { name: '请输入验证码…' }).fill(await readCaptcha())
  respPromise = page.waitForResponse(r => r.url().includes('/api/app/auth/register'))
  await page.getByRole('button', { name: '注 册' }).click()
  resp = await respPromise
  out.steps.push({ step: 'duplicate-phone', status: resp.status(), body: (await resp.text()).slice(0, 80) })

  await page.waitForTimeout(900)
  await page.getByRole('textbox', { name: '请输入手机号…' }).fill('13900004321')
  await page.getByRole('textbox', { name: '请输入验证码…' }).fill(await readCaptcha())
  respPromise = page.waitForResponse(r => r.url().includes('/api/app/auth/register'))
  await page.getByRole('button', { name: '注 册' }).click()
  resp = await respPromise
  const body = await resp.text()
  out.steps.push({ step: 'register-ok', status: resp.status(), body: body.slice(0, 220) })
  await page.waitForTimeout(1500)
  out.finalUrl = page.url()
  out.tokenPresent = await page.evaluate(() => Boolean(localStorage.getItem('joinyuu_client_token')))
  return JSON.stringify(out)
}
