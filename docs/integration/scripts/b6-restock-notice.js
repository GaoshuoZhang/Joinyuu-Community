async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const n = await fetch('/api/app/notices?page=1&pageSize=4', { headers: h })
    const nj = await n.json()
    return JSON.stringify({ notices: (nj.data?.list ?? []).map(x => ({ title: x.title, content: (x.content ?? '').slice(0, 40) })) })
  })
}
