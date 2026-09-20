async page => {
  const out = {}
  async function invite(phone, label) {
    await page.getByRole('button', { name: '邀请成员' }).click()
    await page.waitForTimeout(600)
    await page.getByPlaceholder('请输入成员姓名…').fill(label)
    await page.getByPlaceholder('请输入 11 位手机号…').fill(phone)
    await page.getByPlaceholder('如：产品负责人 / 设计总监…').fill('联调测试')
    const respPromise = page.waitForResponse(r => r.url().includes('/invite'))
    await page.getByRole('button', { name: '发送邀请' }).click()
    const resp = await respPromise
    const body = await resp.text()
    await page.waitForTimeout(700)
    return { status: resp.status(), body: body.slice(0, 120) }
  }
  out.duplicate = await invite('13801210006', '沈嘉禾')
  out.self = await invite('13801210001', '陈屿自己')
  out.unregistered = await invite('13900008888', '未注册用户')
  return JSON.stringify(out)
}
