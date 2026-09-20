async page => {
  const out = {}
  const cancel = page.getByRole('button', { name: '取消' })
  if (await cancel.count()) {
    await cancel.first().click().catch(() => {})
    await page.waitForTimeout(400)
  }
  const closeBtns = page.locator('.t-drawer__close-btn, .t-dialog__close')
  if (await closeBtns.count()) {
    await closeBtns.first().click().catch(() => {})
    await page.waitForTimeout(500)
  }
  await page.goto('http://localhost:7758/#/approvals')
  await page.waitForTimeout(1600)
  const row = page.locator('tr', { hasText: 'AP3018' })
  await row.getByRole('button', { name: '审核' }).click()
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: '驳回', exact: true }).click()
  await page.waitForTimeout(600)
  await page.locator('textarea[placeholder*="驳回原因"]').fill('联调测试：目标身份说明与社区当前需求不匹配，请补充策展项目材料后重提。')
  const respPromise = page.waitForResponse(r => r.url().includes('/applications/AP3018/'))
  await page.getByRole('button', { name: '确认驳回' }).click()
  const resp = await respPromise
  out.reject = { url: resp.url(), status: resp.status(), body: (await resp.text()).slice(0, 120), request: resp.request().postData()?.slice(0, 160) }
  await page.waitForTimeout(1200)
  const main = await page.locator('main').innerText()
  out.mainHasChanged = main.includes('AP3018')
  return JSON.stringify(out)
}
