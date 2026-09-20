async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const checkin = await fetch('/api/admin/events/EV6010/checkin', { method: 'POST', headers: h, body: JSON.stringify({ userId: 'U1002' }) })
    out.checkin = { status: checkin.status, body: (await checkin.text()).slice(0, 140) }
    const list = await fetch('/api/admin/events/enrollments?eventId=EV6010&page=1&pageSize=10', { headers: h })
    const lj = await list.json()
    out.enrollments = (lj.data?.list ?? []).map(x => ({ user: x.userName, uid: x.userId, status: x.status, checkedIn: x.checkedIn ?? x.checkinAt, waitlistOrder: x.waitlistOrder }))
    return out
  })
}
