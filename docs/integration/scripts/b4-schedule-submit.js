async page => {
  await page.locator('input[placeholder="到点自动发布…"]').fill('2026-09-21 10:00')
  const respPromise = page.waitForResponse(r => r.url().includes('/demands/D4014/'))
  await page.getByRole('button', { name: '定时发布', exact: true }).last().click()
  const resp = await respPromise
  const body = await resp.text()
  await page.waitForTimeout(1000)
  const main = await page.locator('main').innerText()
  const rowText = main.split('\n').filter(x => x.includes('D4014')).join(' | ')
  return JSON.stringify({ url: resp.url(), status: resp.status(), body: body.slice(0, 120), request: resp.request().postData()?.slice(0, 120), rowText })
}
