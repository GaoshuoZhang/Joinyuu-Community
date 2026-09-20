async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const points = await fetch('/api/app/me/points-records?page=1&pageSize=5', { headers: h })
    const pj = await points.json()
    const exp = await fetch('/api/app/me/experience-records?page=1&pageSize=5', { headers: h })
    const ej = await exp.json()
    const notices = await fetch('/api/app/notices?page=1&pageSize=6', { headers: h })
    const nj = await notices.json()
    return JSON.stringify({
      points: { status: points.status, list: (pj.data?.list ?? []).map(x => ({ action: x.action ?? x.title, points: x.points ?? x.amount, balance: x.balance, at: x.at })) },
      experience: { status: exp.status, list: (ej.data?.list ?? []).map(x => ({ title: x.title ?? x.action, experience: x.experience ?? x.amount, at: x.at })) },
      notices: (nj.data?.list ?? []).map(x => ({ title: x.title, at: x.at })),
    })
  })
}
