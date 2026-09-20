async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const approve = await fetch('/api/admin/contents/articles/SU1010/review', { method: 'POST', headers: h, body: JSON.stringify({ status: 'approved', comment: '' }) })
    out.approve = { status: approve.status, body: (await approve.text()).slice(0, 100) }
    const d1 = await fetch('/api/admin/contents/articles/SU1010', { headers: h })
    out.afterApprove = ((await d1.json()).data ?? {}).status
    const pub = await fetch('/api/admin/contents/articles/SU1010/publish', { method: 'POST', headers: h })
    out.publish = { status: pub.status, body: (await pub.text()).slice(0, 100) }
    const d2 = await fetch('/api/admin/contents/articles/SU1010', { headers: h })
    const a = (await d2.json()).data ?? {}
    out.final = { status: a.status, publishedAt: a.publishedAt }
    return out
  })
}
