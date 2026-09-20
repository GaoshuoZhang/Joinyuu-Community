async page => {
  const row = page.locator('tr', { hasText: 'AP3021' })
  await row.getByRole('button', { name: '审核' }).click()
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: '驳回', exact: true }).click()
  await page.waitForTimeout(600)
  await page.locator('textarea[placeholder*="驳回原因"]').fill('联调测试：退驻申请已收到，经沟通企业拟继续留在社区，先驳回本次申请。')
  const respPromise = page.waitForResponse(r => r.url().includes('/applications/AP3021/'))
  await page.getByRole('button', { name: '确认驳回' }).click()
  const resp = await respPromise
  const body = await resp.text()
  await page.waitForTimeout(1000)
  return JSON.stringify({ status: resp.status(), body: body.slice(0, 120), request: resp.request().postData()?.slice(0, 160) })
}
