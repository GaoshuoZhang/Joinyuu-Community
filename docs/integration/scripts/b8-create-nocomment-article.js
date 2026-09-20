async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const payload = {
      title: '联调测试：关闭评论的公告文章',
      columnIds: ['CL2001'],
      summary: '联调测试：本篇创建时关闭评论。',
      content: '<p>评论开关在创建时设置；发布后不可修改。</p>',
      tags: ['联调'],
      commentsEnabled: false,
      channel: 'official',
    }
    const create = await fetch('/api/admin/contents/articles', { method: 'POST', headers: h, body: JSON.stringify(payload) })
    const cj = await create.json()
    out.create = { status: create.status, id: cj.data?.id, commentsEnabled: cj.data?.commentsEnabled }
    const id = cj.data?.id
    if (id) {
      const pub = await fetch('/api/admin/contents/articles/' + id + '/publish', { method: 'POST', headers: h })
      out.publish = { status: pub.status }
      const d = await fetch('/api/admin/contents/articles/' + id, { headers: h })
      const a = (await d.json()).data ?? {}
      out.final = { id: a.id, status: a.status, commentsEnabled: a.commentsEnabled }
    }
    return out
  })
}
