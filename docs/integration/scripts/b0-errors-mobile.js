async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const out = {}
    const r1 = await fetch('/api/app/notices?page=1&pageSize=3', { headers: h })
    const j1 = await r1.json()
    out.notices = {
      status: r1.status,
      code: j1.code,
      dataKeys: Object.keys(j1.data ?? {}),
      total: j1.data?.total,
      unreadCount: j1.data?.unreadCount,
      listLen: j1.data?.list?.length,
      sampleAt: j1.data?.list?.[0]?.at,
    }
    const r2 = await fetch('/api/app/demands?page=1&pageSize=3', { headers: h })
    const j2 = await r2.json()
    out.demands = {
      status: r2.status,
      code: j2.code,
      total: j2.data?.total,
      listLen: j2.data?.list?.length,
    }
    const r3 = await fetch('/api/app/demands/D999999', { headers: h })
    out.notFound = { status: r3.status, body: await r3.text() }
    const r4 = await fetch('/api/app/demands?page=0', { headers: h })
    out.badPage = { status: r4.status, body: (await r4.text()).slice(0, 200) }
    return JSON.stringify(out)
  })
}
