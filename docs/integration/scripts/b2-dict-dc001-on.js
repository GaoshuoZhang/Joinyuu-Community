async page => {
  const row = page.locator('tr', { hasText: 'DC001' })
  const respPromise = page.waitForResponse(r => r.url().includes('toggle-status'))
  await row.locator('.t-switch').first().click()
  const resp = await respPromise
  await page.waitForTimeout(900)
  const main = await page.locator('main').innerText()
  return JSON.stringify({ status: resp.status(), enabledCount: (main.match(/启用中 \d+/) ?? [''])[0] })
}
