async page => {
  await page.getByPlaceholder('请说明你的方案、经验或可提供的资源…').fill('联调响应：团队有 3 个小程序看板交付案例，可 3 周内交付并支持验收调整。')
  await page.getByRole('button', { name: '社区企业 · 星澜智能科技' }).click()
  const respPromise = page.waitForResponse(r => r.url().includes('/demands/D4014/respond'))
  await page.getByRole('button', { name: '响应需求' }).click()
  const resp = await respPromise
  const body = await resp.text()
  await page.waitForTimeout(1200)
  const tail = (await page.locator('body').innerText()).slice(-200)
  return JSON.stringify({ status: resp.status(), body: body.slice(0, 120), request: resp.request().postData()?.slice(0, 220), tail })
}
