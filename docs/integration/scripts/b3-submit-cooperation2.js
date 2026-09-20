async page => {
  await page.goto('http://localhost:7759/applications/cooperation')
  await page.waitForTimeout(1500)
  const inputs = page.locator('input:visible')
  await inputs.nth(0).fill('联调合作机构')
  await page.getByPlaceholder('希望在哪些领域、以什么方式与社区及社区企业合作…').fill('联调测试：与社区在技术开发与资源对接方向合作')
  await page.getByPlaceholder('选填：资金、渠道、服务能力等').fill('技术咨询与渠道资源')
  await inputs.nth(1).fill('陈屿')
  await inputs.nth(2).fill('13801210001')
  await page.locator('.picker-cell').first().click()
  await page.waitForTimeout(800)
  const option = page.getByText('服务机构', { exact: true })
  const optionCount = await option.count()
  if (optionCount > 0) {
    await option.first().click()
    await page.waitForTimeout(400)
  }
  const confirm = page.getByText('确认', { exact: true })
  if (await confirm.count()) {
    await confirm.last().click()
    await page.waitForTimeout(400)
  }
  const respPromise = page.waitForResponse(r => r.url().includes('/api/app/applications'))
  await page.getByRole('button', { name: '提交合作申请' }).click()
  let result
  try {
    const resp = await respPromise
    result = { status: resp.status(), body: (await resp.text()).slice(0, 120), request: resp.request().postData()?.slice(0, 240) }
  } catch (e) {
    result = { error: String(e).slice(0, 100) }
  }
  await page.waitForTimeout(800)
  return JSON.stringify({ optionCount, result, url: page.url(), tail: (await page.locator('body').innerText()).slice(-120) })
}
