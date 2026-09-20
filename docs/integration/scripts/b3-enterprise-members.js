async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const r = await fetch('/api/app/me/enterprises/E2001', { headers: { Authorization: 'Bearer ' + t } })
    const j = await r.json()
    return JSON.stringify({ members: (j.data?.members ?? []).map(m => ({ keys: Object.keys(m), key: m.key, name: m.name, phone: m.phone, uid: m.uid, role: m.role, permissions: m.permissions })) })
  })
}
