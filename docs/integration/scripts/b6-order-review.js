async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const r1 = await fetch('/api/app/mall/orders/RO2007/review', { method: 'POST', headers: h, body: JSON.stringify({ rating: 5, comment: '联调测试：帆布包质量很好。' }) })
    const out = { review1: { status: r1.status, body: (await r1.text()).slice(0, 100) } }
    const r2 = await fetch('/api/app/mall/orders/RO2007/review', { method: 'POST', headers: h, body: JSON.stringify({ rating: 4, comment: '重复评价应被拒绝' }) })
    out.review2 = { status: r2.status, body: (await r2.text()).slice(0, 120) }
    const order = await fetch('/api/app/mall/orders/RO2007', { headers: h })
    const oj = await order.json()
    out.order = { status: oj.data?.status, rating: oj.data?.rating, review: oj.data?.review }
    return out
  })
}
