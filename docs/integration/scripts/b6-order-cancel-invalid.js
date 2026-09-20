async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const order = await fetch('/api/app/mall/orders', { method: 'POST', headers: h, body: JSON.stringify({ goodsId: 'G1003', addressId: 'AD1' }) })
    const oj = await order.json()
    out.order = { status: order.status, body: JSON.stringify(oj).slice(0, 120) }
    const id = oj.data?.id
    out.id = id
    if (id) {
      const c1 = await fetch('/api/app/mall/orders/' + id + '/cancel', { method: 'POST', headers: h })
      out.cancel1 = { status: c1.status, body: (await c1.text()).slice(0, 100) }
      const c2 = await fetch('/api/app/mall/orders/' + id + '/cancel', { method: 'POST', headers: h })
      out.cancel2 = { status: c2.status, body: (await c2.text()).slice(0, 100) }
    }
    const bad = await fetch('/api/app/mall/orders', { method: 'POST', headers: h, body: JSON.stringify({ goodsId: 'G1001', addressId: 'AD999' }) })
    out.invalidAddress = { status: bad.status, body: (await bad.text()).slice(0, 120) }
    return out
  })
}
