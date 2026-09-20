async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const r = await fetch('/api/admin/users?keyword=U1001&page=1&pageSize=5', {
      headers: { Authorization: 'Bearer ' + t },
    })
    const j = await r.json()
    const row = j.data?.list?.[0] ?? {}
    return JSON.stringify({
      status: r.status,
      total: j.data?.total,
      uid: row.uid,
      nickname: row.nickname,
      gender: row.gender,
      avatar: row.avatar,
      bio: row.bio,
      realStatus: row.realStatus,
    })
  })
}
