async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const r = await fetch('/api/admin/login-logs?keyword=auditor&page=1&pageSize=20', {
      headers: { Authorization: 'Bearer ' + t },
    })
    const j = await r.json()
    return JSON.stringify({
      status: r.status,
      total: j.data?.total,
      rows: (j.data?.list ?? []).map(x => ({ username: x.username, status: x.status, failReason: x.failReason, at: x.at ?? x.time ?? x.createdAt })),
    })
  })
}
