async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const points = await fetch('/api/app/me/points-records?page=1&pageSize=6', { headers: h })
    const pj = await points.json()
    const n = await fetch('/api/app/notices?page=1&pageSize=6', { headers: h })
    const nj = await n.json()
    const fb = await fetch('/api/app/events/EV6001/feedback', { headers: h })
    return JSON.stringify({
      points: (pj.data?.list ?? []).map(x => ({ delta: x.delta, balance: x.balance, reason: x.reason, at: x.at })),
      notices: (nj.data?.list ?? []).map(x => x.title),
      feedbackForEndedEvent: { status: fb.status, body: (await fb.text()).slice(0, 120) },
    })
  })
}
