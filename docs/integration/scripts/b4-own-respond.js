async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const r = await fetch('/api/app/demands/D4014/respond', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: '联调：禁止响应自己的需求' }),
    })
    return JSON.stringify({ status: r.status, body: (await r.text()).slice(0, 120) })
  })
}
