async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const off = await fetch('/api/admin/events/EV6010/enrollment', { method: 'PATCH', headers: h, body: JSON.stringify({ enrollmentOpen: false }) })
    const g1 = await fetch('/api/admin/events?keyword=EV6010&page=1&pageSize=1', { headers: h })
    return JSON.stringify({ pause: off.status, afterPause: ((await g1.json()).data?.list?.[0])?.enrollmentOpen })
  })
}
