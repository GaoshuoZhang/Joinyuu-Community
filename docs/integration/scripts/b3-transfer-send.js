async page => {
  const respPromise = page.waitForResponse(r => r.url().includes('transfer-contact'))
  await page.getByRole('button', { name: '发送请求' }).click()
  const resp = await respPromise
  const body = await resp.text()
  await page.waitForTimeout(1000)
  const tail = (await page.locator('body').innerText()).slice(-140)
  return JSON.stringify({ status: resp.status(), body: body.slice(0, 120), tail })
}
