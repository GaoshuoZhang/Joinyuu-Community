async page => {
  await page.goto('http://localhost:7759/me/enterprises/E2001')
  await page.waitForTimeout(1600)
  await page.getByRole('button', { name: '申请退驻 / 注销' }).click()
  await page.waitForTimeout(700)
  let tail = (await page.locator('body').innerText()).slice(-160)
  const textarea = page.locator('textarea:visible')
  if (await textarea.count()) {
    await textarea.first().fill('联调测试：申请退驻以验证后台审核流程（随后将由运营驳回）')
  }
  const confirm = page.getByRole('button', { name: '确认申请' })
  const respPromise = page.waitForResponse(r => r.url().includes('exit-application'))
  if (await confirm.count()) {
    await confirm.click()
  } else {
    const alt = page.getByRole('button', { name: '提交申请' })
    await alt.click()
  }
  const resp = await respPromise
  const body = await resp.text()
  await page.waitForTimeout(1000)
  return JSON.stringify({ dialogTail: tail, status: resp.status(), body: body.slice(0, 120), pageTail: (await page.locator('body').innerText()).slice(-120) })
}
