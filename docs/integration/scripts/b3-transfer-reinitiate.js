async page => {
  await page.goto('http://localhost:7759/me/enterprises/E2001')
  await page.waitForTimeout(1600)
  await page.getByText('转移负责人').click()
  await page.waitForTimeout(600)
  await page.getByText('沈嘉禾 · 产品合作').click()
  await page.waitForTimeout(500)
  const respPromise = page.waitForResponse(r => r.url().includes('transfer-contact'))
  await page.getByRole('button', { name: '发送请求' }).click()
  const resp = await respPromise
  const body = await resp.text()
  await page.waitForTimeout(900)
  const tail = (await page.locator('body').innerText()).slice(-120)
  return JSON.stringify({ status: resp.status(), body: body.slice(0, 100), tail })
}
