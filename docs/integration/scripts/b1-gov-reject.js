async page => {
  const out = {}
  const ta = page.locator('textarea').last()
  await ta.fill('联调测试：资料与流程验证，驳回注销申请')
  const respPromise = page.waitForResponse(r => r.url().includes('/review'))
  await page.getByRole('button', { name: '确认执行' }).click()
  const resp = await respPromise
  out.review = { url: resp.url(), status: resp.status(), body: (await resp.text()).slice(0, 120) }
  await page.waitForTimeout(1500)
  const mainText = await page.locator('main').innerText()
  out.rowAfter = mainText.split('\n').filter(x => x.includes('联调测试：请运营驳回')).join(' | ')
  out.statusCell = mainText.includes('已驳回')
  return JSON.stringify(out)
}
