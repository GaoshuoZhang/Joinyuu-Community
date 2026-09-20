async page => {
  const row = page.locator('tr', { hasText: 'D4014' })
  await row.getByRole('button', { name: '定时发布' }).click()
  await page.waitForTimeout(900)
  const tail = (await page.locator('body').innerText()).slice(-260)
  return JSON.stringify({ tail })
}
