async page => {
  await page.locator('input:visible').nth(14).click()
  await page.waitForTimeout(900)
  const tail = (await page.locator('body').innerText()).slice(-200)
  return JSON.stringify({ tail })
}
