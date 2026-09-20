async page => {
  const out = {}
  await page.reload()
  await page.waitForTimeout(1800)
  const acceptButtons = page.getByRole('button', { name: '验收通过' })
  out.acceptCount = await acceptButtons.count()
  const respPromise = page.waitForResponse(r => r.url().includes('/accept'))
  await acceptButtons.first().click()
  try {
    const resp = await respPromise
    out.result = { url: resp.url(), status: resp.status(), body: (await resp.text()).slice(0, 120) }
  } catch (e) {
    out.result = { error: String(e).slice(0, 80) }
  }
  await page.waitForTimeout(1200)
  out.tail = (await page.locator('body').innerText()).slice(-220)
  return JSON.stringify(out)
}
