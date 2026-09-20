async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const cancel = await fetch('/api/app/events/EV6001/enroll/cancel', { method: 'POST', headers: h })
    out.cancelEndedEvent = { status: cancel.status, body: (await cancel.text()).slice(0, 140) }
    const checkin = await fetch('/api/app/events/EV6001/check-in', { method: 'POST', headers: h, body: JSON.stringify({ lat: 30.2741, lng: 120.1551 }) })
    out.checkinEndedEvent = { status: checkin.status, body: (await checkin.text()).slice(0, 140) }
    const fbGet = await fetch('/api/app/events/EV6001/feedback', { headers: h })
    out.feedbackStatus = { status: fbGet.status, body: (await fbGet.text()).slice(0, 140) }
    const fb1 = await fetch('/api/app/events/EV6001/feedback', { method: 'POST', headers: h, body: JSON.stringify({ rating: 5, comment: '联调测试：活动内容扎实，期待下一期。' }) })
    out.feedbackSubmit = { status: fb1.status, body: (await fb1.text()).slice(0, 140) }
    const fb2 = await fetch('/api/app/events/EV6001/feedback', { method: 'POST', headers: h, body: JSON.stringify({ rating: 4, comment: '重复反馈应被拒绝' }) })
    out.feedbackDuplicate = { status: fb2.status, body: (await fb2.text()).slice(0, 140) }
    return out
  })
}
