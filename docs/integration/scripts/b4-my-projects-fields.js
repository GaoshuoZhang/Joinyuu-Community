async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const r = await fetch('/api/app/me/projects', { headers: { Authorization: 'Bearer ' + t } })
    const j = await r.json()
    const list = Array.isArray(j.data) ? j.data : (j.data?.list ?? [])
    return JSON.stringify(list.map(p => ({ id: p.id, role: p.role, partnerName: p.partnerName, enterpriseName: p.enterpriseName, finishedAt: p.finishedAt, sourceDemand: p.sourceDemand?.id ?? p.sourceDemandId })))
  })
}
