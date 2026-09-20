async page => {
  await page.getByText('确定', { exact: true }).last().click()
  await page.waitForTimeout(600)
  const input = page.locator('input:visible').nth(6)
  const value = await input.inputValue()
  const respPromise = page.waitForResponse(r => r.url().includes('/demands/D4014/'))
  await page.locator('.t-dialog', { hasText: '定时发布' }).getByRole('button', { name: '定时发布', exact: true }).click()
  let result
  try {
    const resp = await respPromise
    result = { status: resp.status(), body: (await resp.text()).slice(0, 140), request: resp.request().postData()?.slice(0, 140) }
  } catch (e) {
    result = { error: String(e).slice(0, 80), bodyTail: (await page.locator('body').innerText()).slice(-140) }
  }
  await page.waitForTimeout(1000)
  const main = await page.locator('main').innerText()
  return JSON.stringify({ value, result, rowText: main.split('\n').filter(x => x.includes('D4014') || x.includes('取消定时')).join(' | ') })
}
