async page => {
  const out = {}
  await page.goto('http://localhost:7758/#/system/config')
  await page.waitForTimeout(1500)
  const switches = page.locator('.t-switch')
  for (const i of [1, 2, 3, 5]) {
    const cls = (await switches.nth(i).getAttribute('class')) ?? ''
    if (!cls.includes('checked')) {
      await switches.nth(i).click()
      await page.waitForTimeout(150)
    }
  }
  const respPromise = page.waitForResponse(r => r.url().includes('/api/admin/system/config') && r.request().method() === 'PUT')
  await page.getByRole('button', { name: '保存配置' }).click()
  const resp = await respPromise
  const req = resp.request().postData() ?? ''
  out.put = { status: resp.status(), body: (await resp.text()).slice(0, 60) }
  out.sent = { mallOpen: req.includes('"mallOpen":true'), demandOpen: req.includes('"demandOpen":true'), reservationOpen: req.includes('"reservationOpen":true'), homeCarouselOpen: req.includes('"homeCarouselOpen":true') }
  return JSON.stringify(out)
}
