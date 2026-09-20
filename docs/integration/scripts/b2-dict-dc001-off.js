async page => {
  const row = page.locator('tr', { hasText: 'DC001' })
  await row.locator('.t-switch').first().click()
  await page.waitForTimeout(700)
  const respPromise = page.waitForResponse(r => r.url().includes('toggle-status'))
  const resp = await respPromise
  await page.waitForTimeout(900)
  const main = await page.locator('main').innerText()
  return JSON.stringify({
    toggle: { status: resp.status(), body: (await resp.text()).slice(0, 80) },
    enabledCount: (main.match(/启用中 \d+/) ?? [''])[0],
  })
}
