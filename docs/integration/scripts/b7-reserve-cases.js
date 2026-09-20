async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    async function reserve(name, body) {
      const r = await fetch('/api/app/spaces/reservations', { method: 'POST', headers: h, body: JSON.stringify(body) })
      return { name, status: r.status, body: (await r.text()).slice(0, 140) }
    }
    const out = []
    out.push(await reserve('auto-approve S1002 09-22 10-12 (enterprise)', { spaceId: 'S1002', date: '2026-09-22', start: '10:00', end: '12:00', purpose: '联调测试：企业例会', attendees: 6, asIdentity: 'community_enterprise', asEnterpriseId: 'E2001' }))
    out.push(await reserve('pending S1003 09-22 14-16 (personal)', { spaceId: 'S1003', date: '2026-09-22', start: '14:00', end: '16:00', purpose: '联调测试：个人洽谈', attendees: 2 }))
    out.push(await reserve('conflict S1002 09-22 10-11', { spaceId: 'S1002', date: '2026-09-22', start: '10:00', end: '11:00', purpose: '联调测试：冲突', attendees: 2, asIdentity: 'community_enterprise', asEnterpriseId: 'E2001' }))
    out.push(await reserve('out-of-hours S1002 09-22 19-20', { spaceId: 'S1002', date: '2026-09-22', start: '19:00', end: '20:00', purpose: '联调测试：非开放时段', attendees: 2 }))
    out.push(await reserve('max-hours S1004 09-22 10-13 (2h limit)', { spaceId: 'S1004', date: '2026-09-22', start: '10:00', end: '13:00', purpose: '联调测试：超时长', attendees: 2 }))
    out.push(await reserve('advance-days S1002 2026-10-10', { spaceId: 'S1002', date: '2026-10-10', start: '10:00', end: '11:00', purpose: '联调测试：超提前天数', attendees: 2 }))
    out.push(await reserve('maintenance S1005 09-22 10-11', { spaceId: 'S1005', date: '2026-09-22', start: '10:00', end: '11:00', purpose: '联调测试：维护中空间', attendees: 2 }))
    const mine = await fetch('/api/app/me/reservations', { headers: h })
    const mj = await mine.json()
    const list = Array.isArray(mj.data) ? mj.data : (mj.data?.list ?? [])
    out.push({ name: 'my-reservations', status: mine.status, list: list.slice(0, 4).map(x => ({ id: x.id, space: x.spaceName, date: x.date, time: `${x.startTime}-${x.endTime}`, status: x.status, identity: x.identityType, subject: x.subjectName })) })
    return JSON.stringify(out)
  })
}
