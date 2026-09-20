async page => {
  return await page.evaluate(async () => {
    const c = await fetch('/api/app/auth/captcha')
    const cj = await c.json()
    const svg = decodeURIComponent(String(cj.data.image).replace(/^data:image\/svg\+xml;utf8,/, ''))
    const code = [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/g)].map(m => m[1]).join('')
    const login = await fetch('/api/app/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '13801210006', password: 'user123', captchaId: cj.data.captchaId, captchaCode: code }),
    })
    const lj = await login.json()
    const t = lj.data?.token ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = { login: { status: login.status, uid: lj.data?.uid } }
    const e = await fetch('/api/app/me/enterprises/E2001', { headers: h })
    const ej = await e.json()
    out.myPermissions = ej.data?.myPermissions
    const put = await fetch('/api/app/me/enterprises/E2001', { method: 'PUT', headers: h, body: JSON.stringify({ description: '星澜智能专注于大模型在企业知识管理与智能客服领域的落地应用（成员编辑验证）。' }) })
    out.editCardAsMember = { status: put.status, body: (await put.text()).slice(0, 100) }
    return out
  })
}
