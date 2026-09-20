async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const r = await fetch('/api/app/me/projects/P5009', { headers: { Authorization: 'Bearer ' + t } })
    const j = await r.json()
    return JSON.stringify({
      status: j.data?.status,
      progress: j.data?.progress,
      finishedAt: j.data?.finishedAt,
      closeReason: j.data?.closeReason,
      milestones: (j.data?.milestones ?? []).map(m => ({ id: m.id, name: m.name, status: m.status })),
    })
  })
}
