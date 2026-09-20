async page => {
  const out = {}
  const btn = page.getByRole('button', { name: '立即报名' })
  const respPromise = page.waitForResponse(r => r.url().includes('/enroll'))
  await btn.click()
  try {
    const resp = await respPromise
    out.enroll = { url: resp.url(), status: resp.status(), body: (await resp.text()).slice(0, 140) }
  } catch (e) {
    out.enroll = { error: String(e).slice(0, 80) }
  }
  await page.waitForTimeout(1200)
  out.tail = (await page.locator('body').innerText()).slice(-180)
  return JSON.stringify(out)
}
