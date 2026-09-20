async page => {
  const out = {}
  await page.goto('http://localhost:7759/me/security')
  await page.waitForTimeout(900)
  const respPromise = page.waitForResponse(r => r.url().includes('/api/app/me/data-export'))
  await page.getByText('导出个人数据').click()
  const resp = await respPromise
  out.exportRequest = { status: resp.status(), body: (await resp.text()).slice(0, 80) }
  await page.waitForTimeout(1200)
  out.afterSubmitText = (await page.locator('body').innerText()).split('\n').filter(x => x.includes('导出')).join(' | ')
  out.accountRequests = await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const r = await fetch('/api/app/me/account-requests', { headers: { Authorization: 'Bearer ' + t } })
    const j = await r.json()
    return { status: r.status, data: j.data }
  })
  return JSON.stringify(out)
}
