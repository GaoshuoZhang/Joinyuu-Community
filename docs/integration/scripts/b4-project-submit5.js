async page => {
  const out = {}
  const inputs = page.locator('input:visible')
  await inputs.nth(7).fill('100')
  out.share = await inputs.nth(7).inputValue()
  const dateInput = inputs.nth(14)
  out.dateReadonly = await dateInput.getAttribute('readonly')
  if (out.dateReadonly === null) {
    await dateInput.fill('2026-10-20')
    out.date = await dateInput.inputValue()
  }
  const respPromise = page.waitForResponse(r => r.url().includes('/projects') || r.url().includes('initiate-project')).catch(() => null)
  await page.getByRole('button', { name: '确认立项' }).click()
  await page.waitForTimeout(2500)
  const resp = await respPromise
  if (resp) {
    out.result = { url: resp.url(), status: resp.status(), body: (await resp.text()).slice(0, 220), request: resp.request().postData()?.slice(0, 360) }
  } else {
    out.noResponse = true
    out.tail = (await page.locator('body').innerText()).slice(-200)
  }
  return JSON.stringify(out)
}
