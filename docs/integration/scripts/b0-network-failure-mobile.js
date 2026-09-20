async page => {
  const out = {}
  const pattern = '**/api/app/demands**'
  await page.route(pattern, r => r.abort('failed'))
  await page.reload()
  await page.waitForTimeout(1200)
  const errBody = await page.locator('body').innerText()
  out.errorLines = errBody.split('\n').filter(x => x.includes('失败') || x.includes('重试')).join(' | ')
  out.retryButtons = await page.getByRole('button', { name: '重试' }).count()
  await page.unroute(pattern)
  const retry = page.getByRole('button', { name: '重试' }).first()
  if (await retry.count()) {
    await retry.click()
    await page.waitForTimeout(1500)
  }
  const afterBody = await page.locator('body').innerText()
  out.afterRetryHasList = afterBody.includes('社区小程序前端开发合作')
  out.afterRetryTotal = (afterBody.match(/共 \d+ 条/) ?? [''])[0]
  return JSON.stringify(out)
}
