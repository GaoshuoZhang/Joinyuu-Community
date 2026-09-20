async page => {
  await page.getByPlaceholder('请输入成员姓名…').fill('沈嘉禾')
  await page.getByPlaceholder('请输入 11 位手机号…').fill('13801210006')
  await page.getByPlaceholder('如：产品负责人 / 设计总监…').fill('产品合作')
  const respPromise = page.waitForResponse(r => r.url().includes('/invite'))
  await page.getByRole('button', { name: '发送邀请' }).click()
  const resp = await respPromise
  const body = await resp.text()
  await page.waitForTimeout(900)
  const tail = (await page.locator('body').innerText()).slice(-160)
  return JSON.stringify({ status: resp.status(), body: body.slice(0, 160), request: resp.request().postData()?.slice(0, 160), tail })
}
