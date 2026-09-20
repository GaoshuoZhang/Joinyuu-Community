async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const fb = await fetch('/api/app/events/EV6010/feedback', { method: 'POST', headers: h, body: JSON.stringify({ rating: 5, comment: '未结束活动反馈应被拒绝' }) })
    return JSON.stringify({ feedbackUnended: { status: fb.status, body: (await fb.text()).slice(0, 140) } })
  })
}
