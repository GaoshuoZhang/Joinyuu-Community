async page => {
  const respPromise = page.waitForResponse(r => r.url().includes('/accept'))
  await page.getByRole('button', { name: '确认验收' }).click()
  const resp = await respPromise
  const body = await resp.text()
  await page.waitForTimeout(1500)
  return JSON.stringify({ status: resp.status(), body: body.slice(0, 120), tail: (await page.locator('body').innerText()).slice(-220) })
}
