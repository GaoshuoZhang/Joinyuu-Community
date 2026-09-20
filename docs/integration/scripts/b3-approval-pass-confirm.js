async page => {
  const respPromise = page.waitForResponse(r => r.url().includes('/review') || r.url().includes('/approve'))
  await page.getByRole('button', { name: '确认通过' }).click()
  const resp = await respPromise
  await page.waitForTimeout(1200)
  const main = await page.locator('main').innerText()
  return JSON.stringify({
    review: { url: resp.url(), method: resp.request().method(), status: resp.status(), body: (await resp.text()).slice(0, 120), request: resp.request().postData()?.slice(0, 120) },
    rowStatus: main.split('\n').filter(x => x.includes('AP3019')).join(' | ').slice(0, 120),
  })
}
