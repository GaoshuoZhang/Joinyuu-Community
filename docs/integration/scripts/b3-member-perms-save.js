async page => {
  const labels = ['发布需求', '响应需求', '空间预约', '文章投稿', '管理成员', '邀请成员', '分配权限', '编辑企业名片']
  for (const label of labels) {
    const box = page.locator('.t-checkbox', { hasText: label }).first()
    const cls = (await box.getAttribute('class')) ?? ''
    if (!cls.includes('t-is-checked')) {
      await box.click()
      await page.waitForTimeout(120)
    }
  }
  const respPromise = page.waitForResponse(r => r.url().includes('/member') && r.request().method() === 'PUT')
  await page.getByRole('button', { name: '保存修改' }).click()
  const resp = await respPromise
  const body = await resp.text()
  await page.waitForTimeout(900)
  return JSON.stringify({ status: resp.status(), body: body.slice(0, 120), request: resp.request().postData()?.slice(0, 240) })
}
