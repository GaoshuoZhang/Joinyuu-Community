async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const off = await fetch('/api/admin/events/EV6010/enrollment', { method: 'PATCH', headers: h, body: JSON.stringify({ enrollmentOpen: false }) })
    out.pause = { status: off.status, body: (await off.text()).slice(0, 100) }
    const g1 = await fetch('/api/admin/events?keyword=EV6010&page=1&pageSize=1', { headers: h })
    out.afterPause = ((await g1.json()).data?.list?.[0])?.enrollmentOpen
    const on = await fetch('/api/admin/events/EV6010/enrollment', { method: 'PATCH', headers: h, body: JSON.stringify({ enrollmentOpen: true }) })
    out.resume = { status: on.status }
    const g2 = await fetch('/api/admin/events?keyword=EV6010&page=1&pageSize=1', { headers: h })
    out.afterResume = ((await g2.json()).data?.list?.[0])?.enrollmentOpen
    return out
  })
}
