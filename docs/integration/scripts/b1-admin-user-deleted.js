async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const r = await fetch('/api/admin/users?keyword=U1016&page=1&pageSize=5', { headers: h })
    const j = await r.json()
    const row = j.data?.list?.[0] ?? {}
    const a = await fetch('/api/admin/audit-logs?keyword=U1016&page=1&pageSize=10', { headers: h })
    const aj = await a.json()
    return {
      user: { total: j.data?.total, uid: row.uid, nickname: row.nickname, phone: row.phone, status: row.status, realStatus: row.realStatus, realName: row.realName },
      audits: (aj.data?.list ?? []).map(x => ({ action: x.action, target: x.target, at: x.at ?? x.createdAt })),
    }
  })
}
