async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const approve = await fetch('/api/admin/space-reservations/SR2014/review', { method: 'POST', headers: h, body: JSON.stringify({ status: 'approved' }) })
    out.approve = { status: approve.status, body: (await approve.text()).slice(0, 100) }
    const reject = await fetch('/api/admin/space-reservations/SR2015/review', { method: 'POST', headers: h, body: JSON.stringify({ status: 'rejected', comment: '联调测试：该时段与社区活动筹备冲突，请改期。' }) })
    out.reject = { status: reject.status, body: (await reject.text()).slice(0, 100) }
    const list = await fetch('/api/admin/space-reservations?keyword=SR201&page=1&pageSize=5', { headers: h })
    const lj = await list.json()
    out.rows = (lj.data?.list ?? []).map(x => ({ id: x.id, status: x.status, rejectReason: x.rejectReason, subject: x.subjectName, identity: x.identityType }))
    return out
  })
}
