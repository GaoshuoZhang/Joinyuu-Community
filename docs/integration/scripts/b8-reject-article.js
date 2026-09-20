async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const r = await fetch('/api/admin/contents/articles/SU1010/review', { method: 'POST', headers: h, body: JSON.stringify({ status: 'rejected', comment: '联调测试：请补充案例数据与配图后重提。' }) })
    out.reject = { status: r.status, body: (await r.text()).slice(0, 120) }
    const d = await fetch('/api/admin/contents/articles/SU1010', { headers: h })
    const a = (await d.json()).data ?? {}
    out.after = { status: a.status, rejectReason: a.rejectReason ?? a.reviewNote }
    return out
  })
}
