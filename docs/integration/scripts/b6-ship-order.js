async page => {
  const out = {}
  const row = page.locator('tr', { hasText: 'RO2007' })
  await row.getByRole('button', { name: '发货' }).click()
  await page.waitForTimeout(700)
  const tail = (await page.locator('body').innerText()).slice(-140)
  const inputs = page.locator('input:visible')
  let filled = false
  for (let i = 0; i < await inputs.count(); i++) {
    const ph = (await inputs.nth(i).getAttribute('placeholder')) ?? ''
    if (ph.includes('物流') || ph.includes('单号')) {
      await inputs.nth(i).fill('SF1234567890')
      filled = true
    }
  }
  const respPromise = page.waitForResponse(r => r.url().includes('/ship') || r.url().includes('/orders/RO2007'))
  const confirm = page.getByRole('button', { name: '确认发货' })
  if (await confirm.count()) await confirm.click()
  else await page.getByRole('button', { name: '确定', exact: true }).last().click()
  try {
    const resp = await respPromise
    out.ship = { url: resp.url(), status: resp.status(), body: (await resp.text()).slice(0, 120), request: resp.request().postData()?.slice(0, 120) }
  } catch (e) {
    out.ship = { error: String(e).slice(0, 70), tail: (await page.locator('body').innerText()).slice(-140) }
  }
  await page.waitForTimeout(1200)
  out.filled = filled
  out.dialogTail = tail
  return JSON.stringify(out)
}
