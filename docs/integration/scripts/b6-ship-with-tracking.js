async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const ship = await fetch('/api/admin/mall/redemption-orders/RO2003/ship', { method: 'POST', headers: h, body: JSON.stringify({ trackingNo: 'SF1234567890' }) })
    out.shipWithTracking = { status: ship.status, body: (await ship.text()).slice(0, 100) }
    const list = await fetch('/api/admin/mall/redemption-orders?keyword=RO2003&page=1&pageSize=1', { headers: h })
    const row = ((await list.json()).data?.list?.[0]) ?? {}
    out.row = { status: row.status, trackingNo: row.trackingNo, shippedAt: row.shippedAt }
    return out
  })
}
