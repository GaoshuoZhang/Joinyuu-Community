async page => {
  await page.getByText('星澜智能科技（社区企业 · E2001）').click()
  await page.waitForTimeout(600)
  const inputs = page.locator('input:visible')
  const count = await inputs.count()
  let dateFilled = false
  for (let i = 0; i < count; i++) {
    const ph = (await inputs.nth(i).getAttribute('placeholder')) ?? ''
    if (ph.startsWith('日期') && !(await inputs.nth(i).inputValue())) {
      await inputs.nth(i).fill('2026-10-20')
      dateFilled = true
    }
  }
  const selectedText = (await page.locator('body').innerText()).slice(-140)
  const respPromise = page.waitForResponse(r => r.url().includes('/projects') || r.url().includes('/initiate-project'))
  await page.getByRole('button', { name: '确认立项' }).click()
  let result
  try {
    const resp = await respPromise
    result = { url: resp.url(), status: resp.status(), body: (await resp.text()).slice(0, 160), request: resp.request().postData()?.slice(0, 260) }
  } catch (e) {
    result = { error: String(e).slice(0, 90), tail: (await page.locator('body').innerText()).slice(-200) }
  }
  await page.waitForTimeout(1200)
  return JSON.stringify({ dateFilled, selectedText, result })
}
