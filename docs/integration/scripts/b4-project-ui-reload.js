async page => {
  await page.reload()
  await page.waitForTimeout(1800)
  const body = await page.locator('body').innerText()
  return JSON.stringify({ header: body.slice(0, 220), hasFinished: body.includes('已结项') || body.includes('已完成') })
}
