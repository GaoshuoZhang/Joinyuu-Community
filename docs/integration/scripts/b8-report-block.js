async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const r1 = await fetch('/api/app/reports', { method: 'POST', headers: h, body: JSON.stringify({ targetType: 'demand', targetId: 'D4015', targetTitle: '联调测试：AI 质检 SaaS 天使轮融资', reason: '虚假信息', detail: '联调测试：举报流程验证' }) })
    out.report = { status: r1.status, body: (await r1.text()).slice(0, 140) }
    const r2 = await fetch('/api/app/reports', { method: 'POST', headers: h, body: JSON.stringify({ targetType: 'demand', targetId: 'D4015', targetTitle: '联调测试：AI 质检 SaaS 天使轮融资', reason: '重复举报' }) })
    out.duplicate = { status: r2.status, body: (await r2.text()).slice(0, 140) }
    const mine = await fetch('/api/app/me/reports', { headers: h })
    const mj = await mine.json()
    const list = Array.isArray(mj.data) ? mj.data : (mj.data?.list ?? [])
    out.myReports = list.map(x => ({ id: x.id, target: x.targetTitle, status: x.status ?? x.handleStatus, at: x.at }))
    const block = await fetch('/api/app/me/blocklist', { method: 'POST', headers: h, body: JSON.stringify({ uid: 'U1014' }) })
    out.block = { status: block.status, body: (await block.text()).slice(0, 100) }
    const bl = await fetch('/api/app/me/blocklist', { headers: h })
    const blj = await bl.json()
    const blist = Array.isArray(blj.data) ? blj.data : (blj.data?.list ?? [])
    out.blocklist = blist.map(x => ({ uid: x.uid, name: x.nickname ?? x.name }))
    const unblock = await fetch('/api/app/me/blocklist/U1014/remove', { method: 'POST', headers: h })
    out.unblock = { status: unblock.status, body: (await unblock.text()).slice(0, 100) }
    return out
  })
}
