async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const r = await fetch('/api/app/spaces/reservations', { method: 'POST', headers: h, body: JSON.stringify({ spaceId: 'S1003', date: '2026-09-23', start: '10:00', end: '11:00', purpose: '联调测试：等待后台驳回', attendees: 2 }) })
    return JSON.stringify({ status: r.status, body: (await r.text()).slice(0, 140) })
  })
}
