async page => {
  const out = {}
  const input = page.locator('input:visible').nth(6)
  out.readonly = await input.getAttribute('readonly')
  if (out.readonly === null) {
    await input.fill('2026-09-21 10:00')
  } else {
    out.skipped = true
  }
  out.value = await input.inputValue().catch(() => 'n/a')
  const respPromise = page.waitForResponse(r => r.url().includes('/demands/D4014/'))
  await page.locator('.t-dialog', { hasText: '定时发布' }).getByRole('button', { name: '定时发布', exact: true }).click()
  try {
    const resp = await respPromise
    out.result = { status: resp.status(), body: (await resp.text()).slice(0, 120), request: resp.request().postData()?.slice(0, 120) }
  } catch (e) {
    out.result = { error: String(e).slice(0, 80), bodyTail: (await page.locator('body').innerText()).slice(-160) }
  }
  await page.waitForTimeout(1000)
  const main = await page.locator('main').innerText()
  out.rowText = main.split('\n').filter(x => x.includes('D4014')).join(' | ')
  return JSON.stringify(out)
}
