async page => {
  await page.goto('http://localhost:7759/me/applications')
  await page.waitForTimeout(1800)
  const body = await page.locator('body').innerText()
  const me = await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const r = await fetch('/api/app/me', { headers: { Authorization: 'Bearer ' + t } })
    const j = await r.json()
    const n = await fetch('/api/app/notices?page=1&pageSize=5', { headers: { Authorization: 'Bearer ' + t } })
    const nj = await n.json()
    return {
      identities: (j.data?.identities ?? []).map(x => x.type),
      notices: (nj.data?.list ?? []).map(x => ({ title: x.title, at: x.at })),
    }
  })
  return JSON.stringify({
    pageHasApproved: body.includes('已通过'),
    pageHasTimeline: body.includes('审核通过') || body.includes('通过'),
    me,
  })
}
