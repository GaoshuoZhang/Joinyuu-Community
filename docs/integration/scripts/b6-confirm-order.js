async page => {
  const out = {}
  await page.goto('http://localhost:7759/me/orders/RO2007')
  await page.waitForTimeout(1600)
  out.detail = (await page.locator('body').innerText()).slice(-260)
  const confirm = page.getByRole('button', { name: '确认收货' })
  out.hasConfirm = await confirm.count()
  if (out.hasConfirm) {
    const respPromise = page.waitForResponse(r => r.url().includes('/confirm') || r.url().includes('/orders/RO2007'))
    await confirm.click()
    await page.waitForTimeout(600)
    const dlg = page.getByRole('button', { name: '确认收货', exact: true })
    const dlg2 = page.getByRole('button', { name: '确定', exact: true })
    if (await dlg.count() > 1) await dlg.last().click()
    else if (await dlg2.count()) await dlg2.last().click()
    try {
      const resp = await respPromise
      out.confirm = { url: resp.url(), status: resp.status(), body: (await resp.text()).slice(0, 100) }
    } catch (e) {
      out.confirm = { error: String(e).slice(0, 60) }
    }
  }
  await page.waitForTimeout(1000)
  out.tail = (await page.locator('body').innerText()).slice(-160)
  return JSON.stringify(out)
}
