async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const out = {}
    const body = {
      title: '联调测试：社区协作工作坊',
      type: '培训',
      startTime: '2026-09-25 14:00',
      endTime: '2026-09-25 17:00',
      location: '共享会议室 B',
      capacity: 2,
      speaker: '陈屿',
      host: '聚屿社区',
      description: '联调测试活动：验证人工审核报名、名额与候补、签到与积分、结束后反馈。',
      tags: ['联调', '工作坊'],
      visibilityIdentities: [],
      visibilityLevels: [],
      enrollmentIdentities: [],
      enrollmentLevels: [],
      requireReview: true,
      enrollmentDeadline: '2026-09-24 18:00',
      enrollPoints: 30,
      checkinPoints: 50,
    }
    const create = await fetch('/api/admin/events', { method: 'POST', headers: h, body: JSON.stringify(body) })
    const cj = await create.json()
    out.create = { status: create.status, body: JSON.stringify(cj).slice(0, 160) }
    const id = cj.data?.id
    out.id = id
    if (id) {
      const pub = await fetch('/api/admin/events/' + id + '/publish-now', { method: 'POST', headers: h })
      out.publish = { status: pub.status, body: (await pub.text()).slice(0, 100) }
      const g = await fetch('/api/admin/events?keyword=' + id + '&page=1&pageSize=1', { headers: h })
      const row = ((await g.json()).data?.list?.[0]) ?? {}
      out.after = { status: row.status, enrollmentOpen: row.enrollmentOpen, requireReview: row.requireReview, capacity: row.capacity }
    }
    return out
  })
}
