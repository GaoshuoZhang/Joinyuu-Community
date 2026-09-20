async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const detail = await fetch('/api/admin/contents/articles/A1011', { headers: h })
    const dj = await detail.json()
    const a = dj.data ?? {}
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
    return out
  })
}
