async page => {
  const out = {}
  await page.reload()
  await page.waitForTimeout(1800)
  const row = page.locator('tr', { hasText: 'DR3' })
  const btn = row.getByRole('button', { name: '确认注销' })
  out.buttonEnabled = await btn.isEnabled()
  await btn.click()
  await page.waitForTimeout(600)
  await page.locator('textarea').last().fill('联调测试：冷静期届满，确认执行注销')
  const respPromise = page.waitForResponse(r => r.url().includes('/review'))
  await page.getByRole('button', { name: '确认执行' }).click()
  const resp = await respPromise
  out.review = { status: resp.status(), body: (await resp.text()).slice(0, 120) }
  await page.waitForTimeout(1500)
  out.mainAfter = (await page.locator('main').innerText()).split('\n').filter(x => x.includes('DR3') || x.includes('已通过') || x.includes('已执行') || x.includes('已注销')).join(' | ')
  return JSON.stringify(out)
}
