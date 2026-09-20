async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const cancel = await fetch('/api/admin/events/EV6009/cancel-schedule', { method: 'POST', headers: h })
    out.cancelSchedule = { status: cancel.status }
    const g1 = await fetch('/api/admin/events?keyword=EV6009&page=1&pageSize=1', { headers: h })
    out.afterCancel = ((await g1.json()).data?.list?.[0])?.status
    const schedule = await fetch('/api/admin/events/EV6009/schedule', { method: 'POST', headers: h, body: JSON.stringify({ scheduledAt: '2026-12-01 10:00' }) })
    out.schedule = { status: schedule.status, body: (await schedule.text()).slice(0, 100) }
    const g2 = await fetch('/api/admin/events?keyword=EV6009&page=1&pageSize=1', { headers: h })
    const r2 = ((await g2.json()).data?.list?.[0]) ?? {}
    out.afterSchedule = { status: r2.status, scheduledAt: r2.scheduledAt }
    return out
  })
}
