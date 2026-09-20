async page => {
  const row = page.locator('tr', { hasText: 'U1001' })
  await row.getByRole('button', { name: '查看/编辑' }).click()
  await page.waitForTimeout(900)
  const drawerText = (await page.locator('body').innerText()).slice(-500)
  return JSON.stringify({ drawerText })
}
