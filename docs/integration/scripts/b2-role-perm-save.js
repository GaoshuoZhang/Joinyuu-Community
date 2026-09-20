async page => {
  const dialog = page.locator('.t-dialog', { hasText: '数据范围' }).first()
  const boxes = dialog.locator('.t-checkbox')
  const count = await boxes.count()
  const labels = []
  for (let i = 0; i < count; i++) labels.push(((await boxes.nth(i).innerText()) || '').trim())
  const info = { count, labels }
  const workbench = dialog.locator('.t-checkbox', { hasText: '工作台' }).first()
  await workbench.click()
  await page.waitForTimeout(200)
  const demand = dialog.locator('.t-checkbox', { hasText: '需求管理' }).first()
  await demand.click()
  await page.waitForTimeout(200)
  const contentScope = dialog.locator('.t-checkbox', { hasText: '内容管理' }).first()
  await contentScope.click()
  await page.waitForTimeout(200)
  const respPromise = page.waitForResponse(r => r.url().includes('/api/admin/roles'))
  await dialog.getByRole('button', { name: '保存' }).click()
  const resp = await respPromise
  return JSON.stringify({
    info,
    save: { url: resp.url(), method: resp.request().method(), status: resp.status(), body: (await resp.text()).slice(0, 160), request: resp.request().postData()?.slice(0, 200) },
  })
}
