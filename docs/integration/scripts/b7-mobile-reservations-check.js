async page => {
  const out = {}
  await page.goto('http://localhost:7759/me/reservations')
  await page.waitForTimeout(1800)
  const body = await page.locator('body').innerText()
  out.page = body.slice(0, 700)
  const api = await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const r = await fetch('/api/app/me/reservations', { headers: h })
    const j = await r.json()
    const list = Array.isArray(j.data) ? j.data : (j.data?.list ?? [])
    const sr2013 = list.find(x => x.id === 'SR2013')
    const cancel = sr2013 ? await fetch('/api/app/me/reservations/SR2013/cancel', { method: 'POST', headers: h }) : null
    const n = await fetch('/api/app/notices?page=1&pageSize=4', { headers: h })
    const nj = await n.json()
    return {
      sr2013: sr2013 ? { status: sr2013.status } : null,
      cancel: cancel ? { status: cancel.status, body: (await cancel.text()).slice(0, 100) } : null,
      notices: (nj.data?.list ?? []).map(x => ({ title: x.title, content: (x.content ?? '').slice(0, 40) })),
    }
  })
  out.api = api
  return JSON.stringify(out)
}
