async page => {
  const out = {}
  await page.goto('http://localhost:7759/events/EV6010')
  await page.waitForTimeout(1800)
  const btn = page.getByRole('button', { name: '立即报名' })
  out.hasButton = await btn.count()
  const respPromise = page.waitForResponse(r => r.url().includes('/enroll'))
  await btn.click()
  try {
    const resp = await respPromise
    out.enroll = { status: resp.status(), body: (await resp.text()).slice(0, 120) }
  } catch (e) {
    out.enroll = { error: String(e).slice(0, 80), tail: (await page.locator('body').innerText()).slice(-150) }
  }
  await page.waitForTimeout(1000)
  return JSON.stringify(out)
}
