async page => {
  const inputs = page.locator('input:visible')
  await inputs.nth(0).fill('联调合作机构')
  await page.getByPlaceholder('希望在哪些领域、以什么方式与社区及社区企业合作…').fill('联调测试：与社区在技术开发与资源对接方向合作')
  await page.getByPlaceholder('选填：资金、渠道、服务能力等').fill('技术咨询与渠道资源')
  await inputs.nth(1).fill('陈屿')
  await inputs.nth(2).fill('13801210001')
  await page.getByText('机构类型').click()
  await page.waitForTimeout(700)
  await page.getByText('服务机构', { exact: true }).last().click()
  await page.waitForTimeout(300)
  const confirmBtn = page.getByRole('button', { name: '确认' })
  if (await confirmBtn.count()) {
    await confirmBtn.last().click()
    await page.waitForTimeout(300)
  }
  const respPromise = page.waitForResponse(r => r.url().includes('/api/app/applications'))
  await page.getByRole('button', { name: '提交合作申请' }).click()
  let result
  try {
    const resp = await respPromise
    result = { status: resp.status(), body: (await resp.text()).slice(0, 120), request: resp.request().postData()?.slice(0, 200) }
  } catch (e) {
    result = { error: String(e).slice(0, 120), bodyTail: (await page.locator('body').innerText()).slice(-200) }
  }
  await page.waitForTimeout(800)
  return JSON.stringify({ result, url: page.url(), tail: (await page.locator('body').innerText()).slice(-120) })
}
