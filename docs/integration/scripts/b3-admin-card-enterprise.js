async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const r = await fetch('/api/admin/cards/enterprise/E2001', { headers: { Authorization: 'Bearer ' + t } })
    const j = await r.json()
    return JSON.stringify({ status: r.status, services: j.data?.services, advantages: j.data?.advantages, name: j.data?.name ?? j.data?.enterpriseName })
  })
}
