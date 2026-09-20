async page => {
  await page.locator('textarea[placeholder*="驳回原因"]').fill('联调负向用例：已通过申请再次驳回')
  const respPromise = page.waitForResponse(r => r.url().includes('/applications/AP3019/'))
  await page.getByRole('button', { name: '确认驳回' }).click()
  const resp = await respPromise
  const body = await resp.text()
  await page.waitForTimeout(800)
  const toast = (await page.locator('body').innerText()).split('\n').filter(x => x.includes('仅') || x.includes('驳回')).slice(-3).join(' | ')
  return JSON.stringify({ status: resp.status(), body: body.slice(0, 120), toast })
}
