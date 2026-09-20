async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const list = await fetch('/api/admin/spaces', { headers: h })
    const lj = await list.json()
    const spaces = Array.isArray(lj.data) ? lj.data : (lj.data?.list ?? [])
    const s = spaces.find(x => x.id === 'S1003')
    out.before = { needApproval: s?.needApproval, needReservation: s?.needReservation }
    const payload = {
      name: s.name, type: s.type, capacity: s.capacity, location: s.location,
      openTime: s.openTime, closeTime: s.closeTime, allDay: s.allDay,
      needReservation: s.needReservation, needApproval: true,
      equipment: s.equipment ?? [], description: s.description ?? '',
    }
    const put = await fetch('/api/admin/spaces/S1003', { method: 'PUT', headers: h, body: JSON.stringify(payload) })
    out.put = { status: put.status, body: (await put.text()).slice(0, 100) }
    const list2 = await fetch('/api/admin/spaces', { headers: h })
    const lj2 = await list2.json()
    const spaces2 = Array.isArray(lj2.data) ? lj2.data : (lj2.data?.list ?? [])
    out.after = { needApproval: spaces2.find(x => x.id === 'S1003')?.needApproval }
    return out
  })
}
