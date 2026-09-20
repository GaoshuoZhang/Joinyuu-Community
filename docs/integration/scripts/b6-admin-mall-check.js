async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const toggle = await fetch('/api/admin/mall/goods/G1009/toggle-status', { method: 'POST', headers: h })
    out.toggle = { status: toggle.status }
    const rules = await fetch('/api/admin/mall/points-rules', { headers: h })
    const rj = await rules.json()
    out.pointsRules = (rj.data ?? []).slice(0, 5).map(x => ({ code: x.code, name: x.name ?? x.label, points: x.points, status: x.status }))
    const ledger = await fetch('/api/admin/points-records?userId=U1001&page=1&pageSize=5', { headers: h })
    out.ledgerStatus = ledger.status
    const lj = await ledger.json()
    out.ledger = (lj.data?.list ?? []).slice(0, 5).map(x => ({ delta: x.delta, balance: x.balance, reason: x.reason, at: x.at }))
    const g = await fetch('/api/admin/mall/goods?keyword=G1009&page=1&pageSize=1', { headers: h })
    out.g1009 = { status: ((await g.json()).data?.list?.[0])?.status }
    return out
  })
}
