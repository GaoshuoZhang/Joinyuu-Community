async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const r = await fetch('/api/app/me/account-requests', { headers: h })
    const j = await r.json()
    const url = j.data?.export?.url ?? ''
    const f = await fetch(url, { headers: h })
    let summary = null
    if (f.ok) {
      const data = await f.json()
      summary = {
        topKeys: Object.keys(data),
        uid: data.uid ?? data.user?.uid,
        nickname: data.nickname ?? data.user?.nickname,
        hasPhone: JSON.stringify(data).includes('13900001234'),
      }
    }
    const n = await fetch('/api/app/notices?page=1&pageSize=10', { headers: h })
    const nj = await n.json()
    return {
      exportStatus: f.status,
      summary,
      notices: (nj.data?.list ?? []).map(x => ({ type: x.type, title: x.title, at: x.at })),
    }
  })
}
