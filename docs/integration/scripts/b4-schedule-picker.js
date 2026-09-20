async page => {
  await page.locator('input:visible').nth(6).click()
  await page.waitForTimeout(900)
  const tail = (await page.locator('body').innerText()).slice(-260)
  return JSON.stringify({ tail })
}
