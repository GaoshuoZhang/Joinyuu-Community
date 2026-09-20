async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const out = {}
    const n = await fetch('/api/app/notices?page=1&pageSize=4', { headers: h })
    const nj = await n.json()
    out.notices = (nj.data?.list ?? []).map(x => ({ title: x.title, at: x.at }))
    const points = await fetch('/api/app/me/points-records?page=1&pageSize=3', { headers: h })
    const pj = await points.json()
    out.points = (pj.data?.list ?? []).map(x => ({ delta: x.delta, reason: x.reason, at: x.at }))
    const search = await fetch('/api/app/search?keyword=%E8%81%94%E8%B0%83', { headers: h })
    const sj = await search.json()
    out.search = {
      status: search.status,
      keys: sj.data ? Object.keys(sj.data) : null,
      counts: sj.data?.counts,
      sample: (sj.data?.list ?? sj.data?.results ?? []).slice(0, 5).map(x => ({ type: x.type, title: x.title ?? x.name })),
    }
    const searchDemand = await fetch('/api/app/search?keyword=%E8%81%94%E8%B0%83&type=demand', { headers: h })
    const sdj = await searchDemand.json()
    out.searchDemand = { status: searchDemand.status, count: (sdj.data?.list ?? sdj.data?.results ?? []).length }
    return out
  })
}
