async page => {
  const row = page.locator('tr', { hasText: 'limited_it' })
  await row.getByRole('button', { name: '权限配置' }).click()
  await page.waitForTimeout(1000)
  const dialog = page.locator('.t-dialog, .t-drawer').last()
  const text = (await dialog.innerText()).slice(0, 800)
  return JSON.stringify({ text })
}
