async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const r1 = await fetch('/api/app/me/enterprises/E2001', { method: 'PUT', headers: h, body: JSON.stringify({ services: '企业知识管理', advantages: '尝试写入被禁用字段' }) })
    out.disabledFieldAsFounder = { status: r1.status, body: (await r1.text()).slice(0, 140) }

    const c = await fetch('/api/app/auth/captcha')
    const cj = await c.json()
    const svg = decodeURIComponent(String(cj.data.image).replace(/^data:image\/svg\+xml;utf8,/, ''))
    const code = [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/g)].map(m => m[1]).join('')
    const login = await fetch('/api/app/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '13801210002', password: 'user123', captchaId: cj.data.captchaId, captchaCode: code }),
    })
    const lj = await login.json()
    const t2 = lj.data?.token ?? ''
    out.memberLogin = { status: login.status, uid: lj.data?.uid }
    const r2 = await fetch('/api/app/me/enterprises/E2001', { method: 'PUT', headers: { Authorization: 'Bearer ' + t2, 'Content-Type': 'application/json' }, body: JSON.stringify({ services: '成员尝试写入服务' }) })
    out.memberEdit = { status: r2.status, body: (await r2.text()).slice(0, 140) }
    const r3 = await fetch('/api/app/me/cards', { headers: { Authorization: 'Bearer ' + t2 } })
    const r3j = await r3.json()
    out.memberCards = { status: r3.status, enterpriseKeys: r3j.data?.enterprise ? Object.keys(r3j.data.enterprise) : null }
    return JSON.stringify(out)
  })
}
