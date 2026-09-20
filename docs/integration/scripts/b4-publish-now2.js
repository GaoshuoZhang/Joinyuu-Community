async page => {
  const row = page.locator('tr', { hasText: 'D4014' })
  const btn = row.getByRole('button', { name: '立即发布' })
  const respPromise = page.waitForResponse(r => r.url().includes('/publish-now'), { timeout: 8000 }).catch(() => null)
  await btn.click({ force: true })
  await page.waitForTimeout(1500)
  const resp = await respPromise
  const out = {}
  if (resp) {
    out.status = resp.status()
    out.body = (await resp.text()).slice(0, 100)
  } else {
    out.noResponse = true
    out.tail = (await page.locator('body').innerText()).slice(-200)
  }
  return JSON.stringify(out)
}
