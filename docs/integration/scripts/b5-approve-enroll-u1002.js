async page => {
  const out = {}
  await page.reload()
  await page.waitForTimeout(1800)
  const row = page.locator('tr', { hasText: 'U1002' }).filter({ hasText: 'EV6010' }).first()
  const respPromise = page.waitForResponse(r => r.url().includes('/enrollments/U1002/review'))
  await row.getByRole('button', { name: '通过' }).click()
  await page.waitForTimeout(700)
  const confirm = page.getByRole('button', { name: '确定', exact: true })
  if (await confirm.count()) {
    await confirm.last().click()
  }
  try {
    const resp = await respPromise
    out.result = { status: resp.status(), request: resp.request().postData()?.slice(0, 80) }
  } catch (e) {
    out.result = { error: String(e).slice(0, 60) }
  }
  await page.waitForTimeout(1200)
  out.main = (await page.locator('main').innerText()).slice(0, 420)
  return JSON.stringify(out)
}
