async page => {
  const dialog = page.locator('.t-dialog, .t-drawer').last()
  const inputs = dialog.locator('input')
  await inputs.nth(0).fill('limited_it')
  await inputs.nth(1).fill('联调受限角色')
  await inputs.nth(2).fill('联调测试：仅工作台权限')
  const respPromise = page.waitForResponse(r => r.url().includes('/api/admin/roles') && r.request().method() === 'POST')
  await dialog.getByRole('button', { name: '保存' }).click()
  const resp = await respPromise
  await page.waitForTimeout(800)
  return JSON.stringify({ status: resp.status(), body: (await resp.text()).slice(0, 140) })
}
