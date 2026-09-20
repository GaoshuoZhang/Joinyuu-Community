async page => {
  await page.getByRole('button', { name: '通过', exact: true }).click()
  await page.waitForTimeout(700)
  const confirm = page.getByRole('button', { name: '确认通过' })
  const respPromise = page.waitForResponse(r => r.url().includes('/demands/D4014/'))
  if (await confirm.count()) {
    await confirm.click()
  } else {
    await page.getByRole('button', { name: '确定' }).click()
  }
  const resp = await respPromise
  const body = await resp.text()
  await page.waitForTimeout(900)
  return JSON.stringify({ url: resp.url(), status: resp.status(), body: body.slice(0, 120), request: resp.request().postData()?.slice(0, 120) })
}
