async page => {
  const out = {}
  const inputs = page.locator('input:visible')
  out.count = await inputs.count()
  await inputs.nth(9).fill('100')
  out.shareValue = await inputs.nth(9).inputValue()
  const dateInput = inputs.nth(16)
  out.dateReadonly = await dateInput.getAttribute('readonly')
  if (out.dateReadonly === null) {
    await dateInput.fill('2026-10-20')
    out.dateValue = await dateInput.inputValue()
  } else {
    await dateInput.click()
    await page.waitForTimeout(800)
    const confirm = page.getByText('确定', { exact: true }).last()
    if (await confirm.count()) {
      await confirm.click()
      await page.waitForTimeout(400)
      out.dateValue = await dateInput.inputValue()
    }
  }
  const respPromise = page.waitForResponse(r => r.url().includes('/projects') || r.url().includes('initiate-project'))
  await page.getByRole('button', { name: '确认立项' }).click()
  try {
    const resp = await respPromise
    out.result = { url: resp.url(), status: resp.status(), body: (await resp.text()).slice(0, 200), request: resp.request().postData()?.slice(0, 320) }
  } catch (e) {
    out.result = { error: String(e).slice(0, 90), tail: (await page.locator('body').innerText()).slice(-220) }
  }
  await page.waitForTimeout(1500)
  return JSON.stringify(out)
}
