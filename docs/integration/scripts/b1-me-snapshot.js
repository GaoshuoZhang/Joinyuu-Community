async page => {
  const result = await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const r = await fetch('/api/app/me', { headers: { Authorization: 'Bearer ' + t } })
    const j = await r.json()
    return { status: r.status, gender: j.data?.gender, avatar: j.data?.avatar, bio: j.data?.bio, nickname: j.data?.nickname }
  })
  return JSON.stringify(result)
}
