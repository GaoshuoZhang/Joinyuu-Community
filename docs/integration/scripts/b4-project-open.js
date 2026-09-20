async page => {
  const row = page.locator('tr', { hasText: 'D4014' })
  await row.getByRole('button', { name: '立项' }).click()
  await page.waitForTimeout(1000)
  const tail = (await page.locator('body').innerText()).slice(-400)
  return JSON.stringify({ tail })
}
