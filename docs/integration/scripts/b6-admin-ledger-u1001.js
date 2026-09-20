async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const r = await fetch('/api/admin/points-records?userId=U1001', { headers: h })
    const j = await r.json()
    const list = Array.isArray(j.data) ? j.data : (j.data?.list ?? [])
    return JSON.stringify({
      status: r.status,
      count: list.length,
      latest: list.slice(0, 6).map(x => ({ delta: x.delta, balance: x.balance, reason: x.reason, at: x.at })),
    })
  })
}
