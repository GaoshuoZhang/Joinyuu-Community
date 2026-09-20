async page => {
  const result = await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const r = await fetch('/api/app/me', { headers: { Authorization: 'Bearer ' + t } })
    const j = await r.json()
    return {
      identities: (j.data?.identities ?? []).map(i => ({ type: i.type, label: i.label, enterpriseId: i.enterpriseId, enterpriseName: i.enterpriseName, role: i.role, level: i.level })),
    }
  })
  return JSON.stringify(result)
}
