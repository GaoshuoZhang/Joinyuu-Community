async page => {
  const out = {}
  await page.reload()
  await page.waitForTimeout(1800)
  const submitButtons = page.getByRole('button', { name: '提交完成' })
  const count = await submitButtons.count()
  out.submitButtons = count
  await submitButtons.first().click()
  await page.waitForTimeout(700)
  await page.getByPlaceholder('交付说明（选填）…').fill('联调测试：已补充立项纪要，重新提交验收。')
  const respPromise = page.waitForResponse(r => r.url().includes('/submit'))
  await page.getByRole('button', { name: '确认提交' }).click()
  try {
    const resp = await respPromise
    out.result = { url: resp.url(), status: resp.status(), body: (await resp.text()).slice(0, 120) }
  } catch (e) {
    out.result = { error: String(e).slice(0, 80) }
  }
  await page.waitForTimeout(1000)
  out.tail = (await page.locator('body').innerText()).slice(-150)
  return JSON.stringify(out)
}
