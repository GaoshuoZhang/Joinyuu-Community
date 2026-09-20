async page => {
  await page.getByText('转移负责人').click()
  await page.waitForTimeout(800)
  const tail = (await page.locator('body').innerText()).slice(-240)
  return JSON.stringify({ tail })
}
