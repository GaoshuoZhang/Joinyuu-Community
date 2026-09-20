async page => {
  const out = {}
  const row = page.locator('tr', { hasText: 'U1001' }).filter({ hasText: 'EV6010' }).first()
  const respPromise = page.waitForResponse(r => r.url().includes('/review'))
  await row.getByRole('button', { name: '通过' }).click()
  await page.waitForTimeout(700)
  const confirm = page.getByRole('button', { name: '确定', exact: true })
  if (await confirm.count()) {
    await confirm.last().click()
  }
  try {
    const resp = await respPromise
    out.result = { url: resp.url(), status: resp.status(), body: (await resp.text()).slice(0, 120), request: resp.request().postData()?.slice(0, 120) }
  } catch (e) {
    out.result = { error: String(e).slice(0, 80), tail: (await page.locator('body').innerText()).slice(-140) }
  }
  await page.waitForTimeout(1000)
  return JSON.stringify(out)
}
