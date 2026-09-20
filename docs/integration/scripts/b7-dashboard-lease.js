async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const d = await fetch('/api/admin/dashboard', { headers: h })
    const dj = await d.json()
    return JSON.stringify({ status: d.status, leaseExpiring: dj.data?.todos?.leaseExpiring ?? dj.data?.leaseExpiring ?? null, todos: dj.data?.todos ? Object.keys(dj.data.todos) : Object.keys(dj.data ?? {}) })
  })
}
