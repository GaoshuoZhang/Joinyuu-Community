async page => {
  const out = {}
  const respPromise = page.waitForResponse(r => r.url().includes('/projects') || r.url().includes('initiate-project')).catch(() => null)
  await page.getByRole('button', { name: '确认立项' }).click()
  await page.waitForTimeout(2500)
  const resp = await respPromise
  if (resp) {
    out.result = { url: resp.url(), status: resp.status(), body: (await resp.text()).slice(0, 200), request: resp.request().postData()?.slice(0, 320) }
  } else {
    out.noResponse = true
    out.tail = (await page.locator('body').innerText()).slice(-260)
  }
  return JSON.stringify(out)
}
