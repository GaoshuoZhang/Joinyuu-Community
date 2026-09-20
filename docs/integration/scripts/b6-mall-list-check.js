async page => {
  await page.goto('http://localhost:7759/mall')
  await page.waitForTimeout(1800)
  const body = await page.locator('body').innerText()
  return JSON.stringify({ hasG1009: body.includes('社区联名机械键盘'), count: (body.match(/共 \d+ 件商品/) ?? [''])[0] })
}
