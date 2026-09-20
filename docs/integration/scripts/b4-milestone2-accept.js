async page => {
  const out = {}
  await page.reload()
  await page.waitForTimeout(1800)
  const accept = page.getByRole('button', { name: '验收通过' })
  await accept.first().click()
  await page.waitForTimeout(600)
  const respPromise = page.waitForResponse(r => r.url().includes('/accept'))
  await page.getByRole('button', { name: '确认验收' }).click()
  try {
    const resp = await respPromise
    out.result = { url: resp.url(), status: resp.status(), body: (await resp.text()).slice(0, 120) }
  } catch (e) {
    out.result = { error: String(e).slice(0, 80) }
  }
  await page.waitForTimeout(1800)
  out.tail = (await page.locator('body').innerText()).slice(-260)
  return JSON.stringify(out)
}
