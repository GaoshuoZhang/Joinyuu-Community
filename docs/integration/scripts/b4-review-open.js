async page => {
  const row = page.locator('tr', { hasText: 'D4014' })
  await row.getByRole('button', { name: '审核' }).click()
  await page.waitForTimeout(900)
  const tail = (await page.locator('body').innerText()).slice(-300)
  return JSON.stringify({ tail })
}
