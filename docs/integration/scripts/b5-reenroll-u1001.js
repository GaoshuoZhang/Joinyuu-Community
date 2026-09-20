async page => {
  const out = {}
  await page.goto('http://localhost:7759/events/EV6010')
  await page.waitForTimeout(1800)
  const body = await page.locator('body').innerText()
  out.tail = body.slice(-160)
  const btn = page.getByRole('button', { name: '立即报名' })
  out.hasEnrollButton = await btn.count()
  if (out.hasEnrollButton) {
    const respPromise = page.waitForResponse(r => r.url().includes('/enroll'))
    await btn.click()
    try {
      const resp = await respPromise
      out.reEnroll = { status: resp.status(), body: (await resp.text()).slice(0, 120) }
    } catch (e) {
      out.reEnroll = { error: String(e).slice(0, 60) }
    }
  }
  await page.waitForTimeout(900)
  return JSON.stringify(out)
}
