async page => {
  const out = {}
  await page.reload()
  await page.waitForTimeout(1800)
  const submitButtons = page.getByRole('button', { name: '提交完成' })
  out.count = await submitButtons.count()
  await submitButtons.last().click()
  await page.waitForTimeout(700)
  await page.getByPlaceholder('交付说明（选填）…').fill('联调测试：最终交付物已完成，请验收结项。')
  const respPromise = page.waitForResponse(r => r.url().includes('/submit'))
  await page.getByRole('button', { name: '确认提交' }).click()
  try {
    const resp = await respPromise
    out.result = { url: resp.url(), status: resp.status() }
  } catch (e) {
    out.result = { error: String(e).slice(0, 60) }
  }
  await page.waitForTimeout(1000)
  return JSON.stringify(out)
}
