async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const detail = await fetch('/api/app/mall/goods/G1009', { headers: h })
    const dj = await detail.json()
    out.g1009 = { status: detail.status, goodsStatus: dj.data?.status, stock: dj.data?.stock }
    const order = await fetch('/api/app/mall/orders', { method: 'POST', headers: h, body: JSON.stringify({ goodsId: 'G1009', addressId: 'AD1' }) })
    out.orderOutOfStock = { status: order.status, body: (await order.text()).slice(0, 120) }
    const sub = await fetch('/api/app/mall/goods/G1009/restock-subscribe', { method: 'POST', headers: h })
    out.subscribe = { status: sub.status, body: (await sub.text()).slice(0, 100) }
    const use1 = await fetch('/api/app/mall/orders/RO2004/use', { method: 'POST', headers: h })
    out.use1 = { status: use1.status, body: (await use1.text()).slice(0, 100) }
    const use2 = await fetch('/api/app/mall/orders/RO2004/use', { method: 'POST', headers: h })
    out.use2 = { status: use2.status, body: (await use2.text()).slice(0, 120) }
    return out
  })
}
