async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const body = {
      kind: 'task',
      title: '联调测试：配额验证需求',
      description: '本条用于验证发布额度限制',
      categoryCode: 'DC004',
      categoryDict: 'demand_category',
      asIdentity: 'community_individual',
      contactName: '陈屿',
      contactPhone: '13801210001',
      deliverable: '配额验证交付物',
      deliverBy: '2026-12-31',
    }
    const r = await fetch('/api/app/demands', { method: 'POST', headers: h, body: JSON.stringify(body) })
    return JSON.stringify({ status: r.status, body: (await r.text()).slice(0, 180) })
  })
}
