async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const points = await fetch('/api/app/me/points-records?page=1&pageSize=6', { headers: h })
    const pj = await points.json()
    const proj = await fetch('/api/app/me/projects/P5009', { headers: h })
    const prj = await proj.json()
    return JSON.stringify({
      pointsRaw: JSON.stringify(pj.data).slice(0, 500),
      projectKeys: Object.keys(prj.data ?? {}),
      projectStatus: prj.data?.status,
      finishedAt: prj.data?.finishedAt,
    })
  })
}
