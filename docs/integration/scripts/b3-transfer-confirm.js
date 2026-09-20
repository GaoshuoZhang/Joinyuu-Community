async page => {
  await page.getByText('沈嘉禾 · 产品合作').click()
  await page.waitForTimeout(600)
  let tail = (await page.locator('body').innerText()).slice(-120)
  const confirm = page.getByRole('button', { name: '确认转移' })
  if (await confirm.count()) {
    const respPromise = page.waitForResponse(r => r.url().includes('transfer-contact'))
    await confirm.click()
    const resp = await respPromise
    const body = await resp.text()
    await page.waitForTimeout(900)
    return JSON.stringify({ step: 'confirmed', status: resp.status(), body: body.slice(0, 120), tailBefore: tail })
  }
  return JSON.stringify({ step: 'no-confirm-button', tail })
}
