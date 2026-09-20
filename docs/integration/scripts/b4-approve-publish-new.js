async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    for (const id of ['D4015', 'D4016']) {
      const a = await fetch('/api/admin/demands/' + id + '/approve', { method: 'POST', headers: h })
      const p = await fetch('/api/admin/demands/' + id + '/publish-now', { method: 'POST', headers: h })
      const g = await fetch('/api/admin/demands?keyword=' + id + '&page=1&pageSize=1', { headers: h })
      const row = ((await g.json()).data?.list?.[0]) ?? {}
      out[id] = { approve: a.status, publish: p.status, status: row.status, kind: row.demandType ?? row.kind, categoryLabel: row.categoryLabel, publishedAt: row.publishedAt }
    }
    return out
  })
}
