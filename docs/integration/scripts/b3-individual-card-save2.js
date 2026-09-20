async page => {
  const respPromise = page.waitForResponse(r => r.url().includes('/cards/individual') && r.request().method() === 'PUT')
  await page.getByRole('button', { name: '保存并公开到人才库' }).click()
  const resp = await respPromise
  const body = await resp.text()
  await page.waitForTimeout(1000)
  return JSON.stringify({ status: resp.status(), body: body.slice(0, 120), request: resp.request().postData()?.slice(0, 300), tail: (await page.locator('body').innerText()).slice(-100) })
}
