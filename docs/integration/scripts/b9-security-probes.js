async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const xss = await fetch('/api/app/articles/A1011/comments', { method: 'POST', headers: h, body: JSON.stringify({ content: '<script>alert(1)</script><img src=x onerror=alert(2)>联调XSS测试', asIdentity: 'community_individual' }) })
    out.xssComment = { status: xss.status, body: (await xss.text()).slice(0, 140) }
    const comments = await fetch('/api/app/articles/A1011/comments', { headers: h })
    const cj = await comments.json()
    const list = Array.isArray(cj.data) ? cj.data : (cj.data?.list ?? [])
    const mine = list.find(x => (x.content ?? '').includes('联调XSS测试'))
    out.storedXss = mine ? mine.content : null
    const otherOrder = await fetch('/api/app/me/orders/RO2003', { headers: h })
    out.otherUserOrder = { status: otherOrder.status, body: (await otherOrder.text()).slice(0, 100) }
    const otherDemandResponses = await fetch('/api/app/me/demands/D4004/responses', { headers: h })
    out.otherDemandResponses = { status: otherDemandResponses.status, body: (await otherDemandResponses.text()).slice(0, 100) }
    const order1 = await fetch('/api/app/mall/orders', { method: 'POST', headers: h, body: JSON.stringify({ goodsId: 'G1007', addressId: 'AD1' }) })
    const oj1 = await order1.json()
    const order2 = await fetch('/api/app/mall/orders', { method: 'POST', headers: h, body: JSON.stringify({ goodsId: 'G1007', addressId: 'AD1' }) })
    const oj2 = await order2.json()
    out.doubleOrder = { first: { status: order1.status, id: oj1.data?.id }, second: { status: order2.status, id: oj2.data?.id } }
    if (oj1.data?.id) await fetch('/api/app/mall/orders/' + oj1.data.id + '/cancel', { method: 'POST', headers: h })
    if (oj2.data?.id) await fetch('/api/app/mall/orders/' + oj2.data.id + '/cancel', { method: 'POST', headers: h })
    return out
  })
}
