async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const out = {}
    for (const path of ['/api/admin/reports', '/api/admin/reports?page=1&pageSize=5']) {
      const r = await fetch(path, { headers: h })
      out[path] = { status: r.status, body: (await r.text()).slice(0, 100) }
    }
    return out
  })
}
