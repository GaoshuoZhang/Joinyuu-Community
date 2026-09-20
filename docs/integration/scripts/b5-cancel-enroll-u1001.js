async page => {
  const out = {}
  const row = page.locator('article, div').filter({ hasText: '社区协作工作坊' }).first()
  const respPromise = page.waitForResponse(r => r.url().includes('/enroll') && (r.request().method() === 'DELETE' || r.url().includes('cancel')))
  await page.getByRole('button', { name: '取消报名' }).first().click()
  await page.waitForTimeout(700)
  const confirm = page.getByRole('button', { name: '确认取消' })
  const confirmAlt = page.getByRole('button', { name: '确定', exact: true })
  if (await confirm.count()) await confirm.click()
  else if (await confirmAlt.count()) await confirmAlt.last().click()
  try {
    const resp = await respPromise
    out.cancel = { url: resp.url(), method: resp.request().method(), status: resp.status(), body: (await resp.text()).slice(0, 120) }
  } catch (e) {
    out.cancel = { error: String(e).slice(0, 70), tail: (await page.locator('body').innerText()).slice(-140) }
  }
  await page.waitForTimeout(1200)
  out.tail = (await page.locator('body').innerText()).slice(-160)
  return JSON.stringify(out)
}
