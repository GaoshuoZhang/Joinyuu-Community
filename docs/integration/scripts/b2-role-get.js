async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const r = await fetch('/api/admin/roles', { headers: { Authorization: 'Bearer ' + t } })
    const j = await r.json()
    const role = (j.data ?? []).find(x => x.code === 'limited_it')
    return JSON.stringify(role)
  })
}
