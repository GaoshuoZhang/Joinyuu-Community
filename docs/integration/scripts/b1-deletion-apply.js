async page => {
  const out = {}
  await page.goto('http://localhost:7759/me/security')
  await page.waitForTimeout(900)
  const existing = await page.getByRole('button', { name: '撤回注销申请' }).count()
  if (existing > 0) {
    const cancelPromise = page.waitForResponse(r => r.url().includes('/api/app/me/deletion-request/cancel'))
    await page.getByRole('button', { name: '撤回注销申请' }).click()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: '确认撤回' }).click()
    await cancelPromise
    await page.waitForTimeout(1000)
  }
  await page.getByText('注销账号').first().click()
  await page.waitForTimeout(500)
  await page.locator('textarea').first().fill('联调测试：请运营驳回本次注销申请')
  await page.getByRole('button', { name: '提交注销申请' }).click()
  await page.waitForTimeout(400)
  const applyPromise = page.waitForResponse(r => r.url().includes('/api/app/me/deletion-request'))
  await page.getByRole('button', { name: '提交申请' }).click()
  const applyResp = await applyPromise
  out.apply = { status: applyResp.status(), body: (await applyResp.text()).slice(0, 120) }
  await page.waitForTimeout(1000)
  return JSON.stringify(out)
}
