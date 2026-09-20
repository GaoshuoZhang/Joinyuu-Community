async page => {
  const out = {}
  await page.goto('http://localhost:7759/me/security')
  await page.waitForTimeout(900)

  await page.getByText('注销账号').first().click()
  await page.waitForTimeout(500)
  const textarea = page.locator('textarea').first()
  await textarea.fill('联调测试：验证注销申请与撤回流程')
  await page.getByRole('button', { name: '提交注销申请' }).click()
  await page.waitForTimeout(400)
  const applyPromise = page.waitForResponse(r => r.url().includes('/api/app/me/deletion-request'))
  await page.getByRole('button', { name: '提交申请' }).click()
  const applyResp = await applyPromise
  out.apply = { status: applyResp.status(), body: (await applyResp.text()).slice(0, 120) }
  await page.waitForTimeout(1200)
  const body1 = await page.locator('body').innerText()
  out.afterApplyNote = body1.split('\n').filter(x => x.includes('注销')).join(' | ')

  const cancelPromise = page.waitForResponse(r => r.url().includes('/api/app/me/deletion-request/cancel'))
  await page.getByRole('button', { name: '撤回注销申请' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: '确认撤回' }).click()
  const cancelResp = await cancelPromise
  out.cancel = { status: cancelResp.status(), body: (await cancelResp.text()).slice(0, 120) }
  await page.waitForTimeout(1200)
  const body2 = await page.locator('body').innerText()
  out.afterCancelNote = body2.split('\n').filter(x => x.includes('注销')).join(' | ')
  out.accountRequests = await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const r = await fetch('/api/app/me/account-requests', { headers: { Authorization: 'Bearer ' + t } })
    const j = await r.json()
    return j.data
  })
  return JSON.stringify(out)
}
