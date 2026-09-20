async page => {
  const row = page.locator('tr', { hasText: 'AP3019' })
  await row.getByRole('button', { name: '审核' }).click()
  await page.waitForTimeout(900)
  const text = await page.locator('body').innerText()
  return JSON.stringify({ dialogTail: text.slice(-320) })
}
