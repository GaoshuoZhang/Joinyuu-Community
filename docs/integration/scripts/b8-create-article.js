async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const columns = await fetch('/api/admin/contents/columns', { headers: h })
    const cj = await columns.json()
    const cols = Array.isArray(cj.data) ? cj.data : (cj.data?.list ?? [])
    out.columns = cols.slice(0, 3).map(x => ({ id: x.id, code: x.code, name: x.name, status: x.status }))
    const payload = {
      title: '联调测试：社区协作案例集发布',
      columnIds: [cols[0]?.id ?? 'CL1001'],
      summary: '联调测试文章：验证资讯发布、移动端展示、评论与互动。',
      content: '<p>本文用于三端联调验证：资讯发布 → 移动端广场展示 → 评论/点赞 → 下架与恢复。</p>',
      tags: ['联调'],
      commentsEnabled: true,
      channel: 'official',
    }
    const create = await fetch('/api/admin/contents/articles', { method: 'POST', headers: h, body: JSON.stringify(payload) })
    const cj2 = await create.json()
    out.create = { status: create.status, id: cj2.data?.id, statusValue: cj2.data?.status }
    const id = cj2.data?.id
    if (id) {
      const pub = await fetch('/api/admin/contents/articles/' + id + '/publish', { method: 'POST', headers: h })
      out.publish = { status: pub.status, body: (await pub.text()).slice(0, 100) }
      const detail = await fetch('/api/admin/contents/articles/' + id, { headers: h })
      const dj = await detail.json()
      out.after = { id: dj.data?.id, status: dj.data?.status, publishedAt: dj.data?.publishedAt, commentsEnabled: dj.data?.commentsEnabled }
    }
    return out
  })
}
