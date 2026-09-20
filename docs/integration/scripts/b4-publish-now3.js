async page => {
  const respPromise = page.waitForResponse(r => r.url().includes('/publish-now'))
  await page.getByRole('button', { name: '确定', exact: true }).last().click()
  const resp = await respPromise
  const body = await resp.text()
  await page.waitForTimeout(1200)
  const main = await page.locator('main').innerText()
  return JSON.stringify({ status: resp.status(), body: body.slice(0, 100), rowText: main.split('\n').filter(x => x.includes('D4014')).join(' | ') })
}
