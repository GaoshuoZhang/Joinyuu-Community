async page => {
  await page.locator('input[placeholder*="搜索或选择承接方"]').click()
  await page.waitForTimeout(800)
  const text = (await page.locator('body').innerText()).slice(-300)
  return JSON.stringify({ text })
}
