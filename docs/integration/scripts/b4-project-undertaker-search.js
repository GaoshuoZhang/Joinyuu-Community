async page => {
  const input = page.locator('input[placeholder*="搜索或选择承接方"]')
  await input.fill('星澜')
  await page.waitForTimeout(800)
  const text = (await page.locator('body').innerText()).slice(-160)
  return JSON.stringify({ text })
}
