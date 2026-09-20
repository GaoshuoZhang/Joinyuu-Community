async page => {
  const out = {}
  const btn = page.getByRole('button', { name: '立即兑换' })
  const respPromise = page.waitForResponse(r => r.url().includes('/mall/orders'))
  await btn.click()
  await page.waitForTimeout(700)
  const confirm = page.getByRole('button', { name: '确认兑换' })
  const confirmAlt = page.getByRole('button', { name: '确定', exact: true })
  if (await confirm.count()) await confirm.click()
  else if (await confirmAlt.count()) await confirmAlt.last().click()
  try {
    const resp = await respPromise
    out.order = { url: resp.url(), status: resp.status(), body: (await resp.text()).slice(0, 160), request: resp.request().postData()?.slice(0, 160) }
  } catch (e) {
    out.order = { error: String(e).slice(0, 70), tail: (await page.locator('body').innerText()).slice(-180) }
  }
  await page.waitForTimeout(1200)
  out.tail = (await page.locator('body').innerText()).slice(-180)
  return JSON.stringify(out)
}
