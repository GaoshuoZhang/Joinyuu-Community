async page => {
  const out = {}
  await page.getByRole('button', { name: '选择为意向承接方' }).click()
  await page.waitForTimeout(500)
  out.afterSelect = (await page.locator('body').innerText()).slice(-160)
  const respPromise = page.waitForResponse(r => r.url().includes('/me/demands/D4014/select'))
  await page.getByRole('button', { name: '提交立项' }).click()
  const resp = await respPromise
  out.submit = { status: resp.status(), body: (await resp.text()).slice(0, 120), request: resp.request().postData()?.slice(0, 120) }
  await page.waitForTimeout(1200)
  out.tail = (await page.locator('body').innerText()).slice(-200)
  return JSON.stringify(out)
}
