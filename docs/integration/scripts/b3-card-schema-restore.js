async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const body = { editableFields: ['logo', 'industry', 'size', 'foundedAt', 'website', 'address', 'description', 'services', 'advantages'] }
    const r = await fetch('/api/admin/cards/schema/enterprise', { method: 'PUT', headers: h, body: JSON.stringify(body) })
    return JSON.stringify({ status: r.status, body: (await r.text()).slice(0, 120) })
  })
}
