async page => {
  await page.locator('.publish-actions button').click()
  await page.waitForTimeout(1600)
  return JSON.stringify({ url: page.url() })
}
