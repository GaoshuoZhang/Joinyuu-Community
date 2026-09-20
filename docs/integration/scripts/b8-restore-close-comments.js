async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const r = await fetch('/api/admin/contents/articles/A1011/restore', { method: 'POST', headers: h })
    out.restore = { status: r.status, body: (await r.text()).slice(0, 100) }
    const d = await fetch('/api/admin/contents/articles/A1011', { headers: h })
    const a = (await d.json()).data ?? {}
    out.afterRestore = { status: a.status }
    const payload = {
      title: a.title,
      columnIds: [a.columnId ?? a.columnIds?.[0]],
      authorId: a.authorId ?? undefined,
      authorName: a.authorName ?? undefined,
      summary: a.summary,
      content: a.content,
      tags: a.tags ?? [],
      commentsEnabled: false,
    }
    const put = await fetch('/api/admin/contents/articles/A1011', { method: 'PUT', headers: h, body: JSON.stringify(payload) })
    out.update = { status: put.status, body: (await put.text()).slice(0, 120) }
    const d2 = await fetch('/api/admin/contents/articles/A1011', { headers: h })
    out.commentsEnabled = ((await d2.json()).data ?? {}).commentsEnabled
    const pub = await fetch('/api/admin/contents/articles/A1011/publish', { method: 'POST', headers: h })
    out.publish = { status: pub.status, body: (await pub.text()).slice(0, 100) }
    const d3 = await fetch('/api/admin/contents/articles/A1011', { headers: h })
    const a3 = (await d3.json()).data ?? {}
    out.final = { status: a3.status, commentsEnabled: a3.commentsEnabled }
    return out
  })
}
