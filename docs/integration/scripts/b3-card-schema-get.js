async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const g = await fetch('/api/admin/cards/schema/enterprise', { headers: h })
    const gj = await g.json()
    return JSON.stringify({ status: g.status, editableFields: gj.data?.editableFields })
  })
}
