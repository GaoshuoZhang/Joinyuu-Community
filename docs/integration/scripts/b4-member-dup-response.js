async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const dup = await fetch('/api/app/demands/D4014/respond', { method: 'POST', headers: h, body: JSON.stringify({ note: '重复响应测试', asIdentity: 'community_enterprise', asEnterpriseId: 'E2001' }) })
    out.duplicate = { status: dup.status, body: (await dup.text()).slice(0, 120) }
    const mine = await fetch('/api/app/me/responses', { headers: h })
    const mj = await mine.json()
    out.myResponses = (mj.data?.list ?? []).map(x => ({ id: x.id, demandId: x.demandId, demandTitle: x.demandTitle, status: x.status, asEnterpriseName: x.asEnterpriseName ?? x.enterpriseName }))
    return out
  })
}
