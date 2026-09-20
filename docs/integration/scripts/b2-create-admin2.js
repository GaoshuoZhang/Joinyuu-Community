async page => {
  await page.getByRole('button', { name: '新增管理员' }).click()
  await page.waitForTimeout(700)
  await page.getByRole('textbox', { name: '登录用户名（唯一）…' }).fill('limited_it_admin')
  await page.getByRole('textbox', { name: '操作日志中的操作人显示名…' }).fill('联调受限账号')
  await page.getByRole('textbox', { name: '选择角色（可多选）…' }).click()
  await page.waitForTimeout(600)
  await page.getByText('联调受限角色').last().click()
  await page.waitForTimeout(400)
  await page.locator('.t-dialog', { hasText: '新增管理员' }).getByText('新增管理员', { exact: true }).first().click()
  await page.waitForTimeout(300)
  const respPromise = page.waitForResponse(r => r.url().includes('/api/admin/admins') && r.request().method() === 'POST')
  await page.locator('.t-dialog', { hasText: '新增管理员' }).getByRole('button', { name: '保存' }).click()
  const resp = await respPromise
  const body = await resp.text()
  await page.waitForTimeout(800)
  return JSON.stringify({ status: resp.status(), body: body.slice(0, 220) })
}
