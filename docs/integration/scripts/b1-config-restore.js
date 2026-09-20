async page => {
  const out = {}
  const switches = page.locator('.t-switch')
  out.switchCount = await switches.count()
  await switches.nth(0).click()
  await page.waitForTimeout(300)
  const respPromise = page.waitForResponse(r => r.url().includes('/api/admin/system/config') && r.request().method() === 'PUT')
  await page.getByRole('button', { name: '保存配置' }).click()
  const resp = await respPromise
  out.put = { status: resp.status(), body: (await resp.text()).slice(0, 80) }
  const reqBody = resp.request().postData()
  out.sentRegistrationOpen = reqBody?.includes('"registrationOpen":true') ?? null
  await page.waitForTimeout(800)
  out.savedText = (await page.locator('main').innerText()).split('\n').filter(x => x.includes('最近保存')).join(' | ')
  return JSON.stringify(out)
}
