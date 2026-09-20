async page => {
  const cancel = page.locator('.t-dialog', { hasText: '定时发布' }).getByRole('button', { name: '取消' })
  if (await cancel.count()) {
    await cancel.click()
    await page.waitForTimeout(500)
  }
  const row = page.locator('tr', { hasText: 'D4014' })
  const respPromise = page.waitForResponse(r => r.url().includes('/demands/D4014/'))
  await row.getByRole('button', { name: '立即发布' }).click()
  const resp = await respPromise
  const body = await resp.text()
  await page.waitForTimeout(1000)
  const main = await page.locator('main').innerText()
  const rowText = main.split('\n').filter(x => x.includes('D4014')).join(' | ')
  return JSON.stringify({ url: resp.url(), status: resp.status(), body: body.slice(0, 100), rowText })
}
