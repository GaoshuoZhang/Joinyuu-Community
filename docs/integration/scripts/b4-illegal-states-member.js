async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const respClosed = await fetch('/api/app/demands/D4004/respond', { method: 'POST', headers: h, body: JSON.stringify({ note: '联调：关闭后响应应被拒绝' }) })
    out.respondClosedDemand = { status: respClosed.status, body: (await respClosed.text()).slice(0, 120) }
    const respProjected = await fetch('/api/app/demands/D4014/respond', { method: 'POST', headers: h, body: JSON.stringify({ note: '联调：已立项后响应应被拒绝', asIdentity: 'community_enterprise', asEnterpriseId: 'E2001' }) })
    out.respondProjectedDemand = { status: respProjected.status, body: (await respProjected.text()).slice(0, 120) }

    const c = await fetch('/api/app/auth/captcha')
    const cj = await c.json()
    const svg = decodeURIComponent(String(cj.data.image).replace(/^data:image\/svg\+xml;utf8,/, ''))
    const code = [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/g)].map(m => m[1]).join('')
    const login = await fetch('/api/app/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '13801210003', password: 'user123', captchaId: cj.data.captchaId, captchaCode: code }),
    })
    const lj = await login.json()
    const h3 = { Authorization: 'Bearer ' + (lj.data?.token ?? ''), 'Content-Type': 'application/json' }
    const acceptAsOutsider = await fetch('/api/app/me/projects/P5009/milestones/28573/accept', { method: 'POST', headers: h3 })
    out.outsiderAccept = { status: acceptAsOutsider.status, body: (await acceptAsOutsider.text()).slice(0, 120) }
    const viewProject = await fetch('/api/app/me/projects/P5009', { headers: h3 })
    out.outsiderViewProject = { status: viewProject.status, body: (await viewProject.text()).slice(0, 120) }
    return out
  })
}
