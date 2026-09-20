async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const out = {}
    const r1 = await fetch('/api/admin/users?page=1&pageSize=3', { headers: h })
    const j1 = await r1.json()
    out.users = {
      status: r1.status,
      code: j1.code,
      dataKeys: Object.keys(j1.data ?? {}),
      total: j1.data?.total,
      listLen: j1.data?.list?.length,
      sampleRegisteredAt: j1.data?.list?.[0]?.registeredAt,
      sampleLastActiveAt: j1.data?.list?.[0]?.lastActiveAt,
    }
    const r2 = await fetch('/api/admin/demands?page=1&pageSize=3', { headers: h })
    const j2 = await r2.json()
    out.demands = {
      status: r2.status,
      code: j2.code,
      total: j2.data?.total,
      listLen: j2.data?.list?.length,
      firstKeys: Object.keys(j2.data?.list?.[0] ?? {}),
      sampleAt: j2.data?.list?.[0]?.createdAt ?? j2.data?.list?.[0]?.publishedAt,
    }
    return JSON.stringify(out)
  })
}
