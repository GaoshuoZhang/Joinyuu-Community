async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const s = await fetch('/api/admin/demands/D4014/schedule', { method: 'POST', headers: h, body: JSON.stringify({ scheduledAt: '2026-09-21 10:00' }) })
    out.schedule = { status: s.status, body: (await s.text()).slice(0, 100) }
    const list = await fetch('/api/admin/demands?keyword=D4014&page=1&pageSize=3', { headers: h })
    const lj = await list.json()
    const row = lj.data?.list?.[0] ?? {}
    out.afterSchedule = { status: row.status, publishedAt: row.publishedAt, scheduledAt: row.scheduledAt }
    const c = await fetch('/api/admin/demands/D4014/cancel-schedule', { method: 'POST', headers: h })
    out.cancel = { status: c.status, body: (await c.text()).slice(0, 100) }
    const list2 = await fetch('/api/admin/demands?keyword=D4014&page=1&pageSize=3', { headers: h })
    const lj2 = await list2.json()
    const row2 = lj2.data?.list?.[0] ?? {}
    out.afterCancel = { status: row2.status, scheduledAt: row2.scheduledAt }
    return out
  })
}
