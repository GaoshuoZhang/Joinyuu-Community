async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const r = await fetch('/api/app/events/EV6010/enroll', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: '{}' })
    return JSON.stringify({ status: r.status, body: (await r.text()).slice(0, 120) })
  })
}
