async page => {
  const out = {}
  const card = page.locator('div', { hasText: '星澜智能科技' }).filter({ hasText: '2026-09-22' }).first()
  const btn = card.getByRole('button', { name: '取消预约' })
  out.buttonCount = await btn.count()
  const respPromise = page.waitForResponse(r => r.url().includes('cancel') || r.url().includes('reservation'))
  await btn.first().click()
  await page.waitForTimeout(700)
  const confirm = page.getByRole('button', { name: '确认取消' })
  if (await confirm.count()) await confirm.click()
  else await page.getByRole('button', { name: '确定', exact: true }).last().click()
  try {
    const resp = await respPromise
    out.cancel = { url: resp.url(), method: resp.request().method(), status: resp.status(), body: (await resp.text()).slice(0, 120) }
  } catch (e) {
    out.cancel = { error: String(e).slice(0, 60) }
  }
  await page.waitForTimeout(1200)
  out.tail = (await page.locator('body').innerText()).slice(-120)
  return JSON.stringify(out)
}
