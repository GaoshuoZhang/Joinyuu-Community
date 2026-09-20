async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const close = await fetch('/api/admin/demands/D4004/status', { method: 'PATCH', headers: h, body: JSON.stringify({ status: 'closed' }) })
    out.close = { status: close.status, body: (await close.text()).slice(0, 100) }
    const g = await fetch('/api/admin/demands?keyword=D4004&page=1&pageSize=3', { headers: h })
    const row = ((await g.json()).data?.list?.[0]) ?? {}
    out.afterClose = row.status
    const payloadRes = await fetch('/api/admin/demands?keyword=D4014&page=1&pageSize=1', { headers: h })
    const pj = await payloadRes.json()
    const d4014 = pj.data?.list?.[0] ?? {}
    const edit = await fetch('/api/admin/demands/D4014', {
      method: 'PUT',
      headers: h,
      body: JSON.stringify({
        title: d4014.title,
        category: d4014.category,
        description: d4014.description ?? '',
        budget: d4014.budget ?? '',
        period: d4014.period ?? '',
        deadline: d4014.deadline ?? '',
        visibilityIdentities: d4014.visibilityIdentities ?? [],
        visibilityLevels: d4014.visibilityLevels ?? [],
        enrollmentIdentities: d4014.enrollmentIdentities ?? [],
        enrollmentLevels: d4014.enrollmentLevels ?? [],
        tags: d4014.tags ?? [],
      }),
    })
    out.editProjected = { status: edit.status, body: (await edit.text()).slice(0, 130) }
    return out
  })
}
