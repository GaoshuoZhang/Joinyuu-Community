async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const g = await fetch('/api/admin/mall/goods?keyword=G1009&page=1&pageSize=1', { headers: h })
    const row = ((await g.json()).data?.list?.[0]) ?? {}
    const payload = {
      name: row.name,
      category: row.category,
      fulfillment: row.fulfillment,
      points: row.points,
      stock: 6,
      description: row.description,
      shippingMethods: row.shippingMethods ?? [],
      shippingFee: row.shippingFee ?? 0,
      status: 'on',
      visibilityIdentities: row.visibilityIdentities ?? [],
      visibilityLevels: row.visibilityLevels ?? [],
      purchaseLimit: row.purchaseLimit ?? null,
    }
    const put = await fetch('/api/admin/mall/goods/G1009', { method: 'PUT', headers: h, body: JSON.stringify(payload) })
    const out = { restock: { status: put.status } }
    const g2 = await fetch('/api/admin/mall/goods?keyword=G1009&page=1&pageSize=1', { headers: h })
    const row2 = ((await g2.json()).data?.list?.[0]) ?? {}
    out.after = { status: row2.status, stock: row2.stock }
    return out
  })
}
