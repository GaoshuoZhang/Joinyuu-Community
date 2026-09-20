async page => {
  await page.getByRole('button', { name: '退回修改' }).click()
  await page.waitForTimeout(700)
  const tail = (await page.locator('body').innerText()).slice(-200)
  return JSON.stringify({ tail })
}
