async page => {
  await page.getByRole('button', { name: '新增活动' }).click()
  await page.waitForTimeout(1000)
  const tail = (await page.locator('body').innerText()).slice(-400)
  return JSON.stringify({ tail })
}
