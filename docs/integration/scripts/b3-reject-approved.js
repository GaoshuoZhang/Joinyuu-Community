async page => {
  const respPromise = page.waitForResponse(r => r.url().includes('/applications/AP3019/'))
  await page.getByRole('button', { name: '确认驳回' }).click()
  const resp = await respPromise
  const body = await resp.text()
  await page.waitForTimeout(600)
  const toast = (await page.locator('body').innerText()).split('\n').filter(x => x.includes('仅') || x.includes('驳回')).slice(-3).join(' | ')
  return JSON.stringify({ status: resp.status(), body: body.slice(0, 120), toast })
}
