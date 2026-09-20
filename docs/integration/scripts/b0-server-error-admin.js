async page => {
  const out = {}
  const pattern = '**/api/admin/users**'
  await page.route(pattern, r =>
    r.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ code: 500, message: '服务器内部错误' }),
    }),
  )
  await page.goto('http://localhost:7758/#/users')
  await page.waitForTimeout(1500)
  const body = await page.locator('body').innerText()
  out.errorLines = body.split('\n').filter(x => x.includes('服务器内部错误') || x.includes('重试')).join(' | ')
  out.retryButtons = await page.getByRole('button', { name: '重试' }).count()
  await page.unroute(pattern)
  const retry = page.getByRole('button', { name: '重试' }).first()
  if (await retry.count()) {
    await retry.click()
    await page.waitForTimeout(1500)
  }
  const after = await page.locator('body').innerText()
  out.afterRetryHasRow = after.includes('陈屿')
  return JSON.stringify(out)
}
