async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const cancel = await fetch('/api/admin/events/EV6010/cancel', { method: 'POST', headers: h })
    out.cancel = { status: cancel.status, body: (await cancel.text()).slice(0, 100) }
    const g1 = await fetch('/api/admin/events?keyword=EV6010&page=1&pageSize=1', { headers: h })
    const r1 = ((await g1.json()).data?.list?.[0]) ?? {}
    out.afterCancel = { status: r1.status, enrollmentOpen: r1.enrollmentOpen }
    const restore = await fetch('/api/admin/events/EV6010/restore', { method: 'POST', headers: h })
    out.restore = { status: restore.status, body: (await restore.text()).slice(0, 100) }
    const g2 = await fetch('/api/admin/events?keyword=EV6010&page=1&pageSize=1', { headers: h })
    const r2 = ((await g2.json()).data?.list?.[0]) ?? {}
    out.afterRestore = { status: r2.status, enrollmentOpen: r2.enrollmentOpen }
    const pub = await fetch('/api/admin/events/EV6010/publish-now', { method: 'POST', headers: h })
    out.republish = { status: pub.status }
    const g3 = await fetch('/api/admin/events?keyword=EV6010&page=1&pageSize=1', { headers: h })
    out.final = ((await g3.json()).data?.list?.[0])?.status
    return out
  })
}
