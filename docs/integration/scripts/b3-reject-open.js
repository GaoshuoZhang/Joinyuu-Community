async page => {
  const row = page.locator('tr', { hasText: 'AP3018' })
  await row.getByRole('button', { name: '审核' }).click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: '驳回', exact: true }).click()
  await page.waitForTimeout(600)
  const tail = (await page.locator('body').innerText()).slice(-200)
  return JSON.stringify({ tail })
}
