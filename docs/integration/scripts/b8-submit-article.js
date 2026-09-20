async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const r = await fetch('/api/app/articles', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        title: '联调测试投稿：创业社区观察',
        columnCode: 'CL2003',
        summary: '联调测试投稿：验证投稿审核、驳回原因、修改重提与发布。',
        content: '<p>这是一篇联调测试投稿，用于验证投稿全链路。</p>',
        tags: ['联调'],
        asIdentity: 'community_individual',
      }),
    })
    const j = await r.json()
    out.create = { status: r.status, body: JSON.stringify(j).slice(0, 160) }
    const id = j.data?.id
    out.id = id
    if (id) {
      const mine = await fetch('/api/app/me/articles', { headers: h })
      const mj = await mine.json()
      const list = Array.isArray(mj.data) ? mj.data : (mj.data?.list ?? [])
      out.myArticles = list.slice(0, 3).map(x => ({ id: x.id, title: x.title, status: x.status }))
    }
    return out
  })
}
