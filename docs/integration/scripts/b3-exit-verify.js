async page => {
  await page.goto('http://localhost:7759/me/enterprises/E2001')
  await page.waitForTimeout(1500)
  const enterpriseText = await page.locator('body').innerText()
  const notices = await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const r = await fetch('/api/app/notices?page=1&pageSize=4', { headers: { Authorization: 'Bearer ' + t } })
    const j = await r.json()
    return (j.data?.list ?? []).map(x => ({ title: x.title, content: (x.content ?? '').slice(0, 40), at: x.at }))
  })
  return JSON.stringify({
    hasPendingExit: enterpriseText.includes('退驻/注销申请处理中'),
    notices,
  })
}
