async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const retract = await fetch('/api/admin/demands/D4004/retract', { method: 'POST', headers: h, body: JSON.stringify({ takedownReason: '联调测试：临时下架验证撤回发布' }) })
    out.retract = { status: retract.status, body: (await retract.text()).slice(0, 100) }
    const g1 = await fetch('/api/admin/demands?keyword=D4004&page=1&pageSize=3', { headers: h })
    out.afterRetract = ((await g1.json()).data?.list?.[0]?.status) ?? null
    const publish = await fetch('/api/admin/demands/D4004/publish-now', { method: 'POST', headers: h })
    out.republish = { status: publish.status }
    const g2 = await fetch('/api/admin/demands?keyword=D4004&page=1&pageSize=3', { headers: h })
    out.afterPublish = ((await g2.json()).data?.list?.[0]?.status) ?? null
    const close = await fetch('/api/admin/demands/D4004/status', { method: 'PATCH', headers: h, body: JSON.stringify({}) })
    out.close = { status: close.status, body: (await close.text()).slice(0, 100) }
    const g3 = await fetch('/api/admin/demands?keyword=D4004&page=1&pageSize=3', { headers: h })
    out.afterClose = ((await g3.json()).data?.list?.[0]?.status) ?? null
    const pendingPublish = await fetch('/api/admin/demands/D4011/publish-now', { method: 'POST', headers: h })
    out.pendingDirectPublish = { status: pendingPublish.status, body: (await pendingPublish.text()).slice(0, 110) }
    const editProjected = await fetch('/api/admin/demands/D4014', { method: 'PUT', headers: h, body: JSON.stringify({ title: '已立项后编辑测试' }) })
    out.editProjected = { status: editProjected.status, body: (await editProjected.text()).slice(0, 110) }
    return out
  })
}
