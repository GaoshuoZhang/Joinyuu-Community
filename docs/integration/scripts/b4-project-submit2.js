async page => {
  const out = {}
  const inputs = page.locator('input:visible')
  const share = page.locator('input[placeholder=""]').nth(0)
  await share.fill('100').catch(e => { out.shareError = String(e).slice(0, 60) })
  out.shareValue = await share.inputValue().catch(() => 'n/a')
  const dateInput = page.locator('input[placeholder="日期 *…"]').nth(1)
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
    } else {
      out.pickerTail = (await page.locator('body').innerText()).slice(-120)
    }
  }
  const respPromise = page.waitForResponse(r => r.url().includes('/projects'))
  await page.getByRole('button', { name: '确认立项' }).click()
  try {
    const resp = await respPromise
    out.result = { url: resp.url(), status: resp.status(), body: (await resp.text()).slice(0, 180), request: resp.request().postData()?.slice(0, 300) }
  } catch (e) {
    out.result = { error: String(e).slice(0, 90), tail: (await page.locator('body').innerText()).slice(-180) }
  }
  await page.waitForTimeout(1200)
  return JSON.stringify(out)
}
