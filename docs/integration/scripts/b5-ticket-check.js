async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const ticket = await fetch('/api/app/events/EV6001/ticket', { headers: h })
    out.ticket = { status: ticket.status, body: (await ticket.text()).slice(0, 200) }
    const checkin = await fetch('/api/app/events/EV6001/check-in', { method: 'POST', headers: h, body: JSON.stringify({ lat: 30.2741, lng: 120.1551 }) })
    out.checkinEnded = { status: checkin.status, body: (await checkin.text()).slice(0, 140) }
    return out
  })
}
