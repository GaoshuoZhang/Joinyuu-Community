async page => {
  const cancel = page.locator('.t-dialog', { hasText: '需求立项' }).getByRole('button', { name: '取消' })
  if (await cancel.count()) {
    await cancel.click().catch(() => {})
    await page.waitForTimeout(600)
  }
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_admin_token') ?? ''
    const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
    const body = {
      projectName: '联调测试：小程序数据看板开发合作',
      undertakers: [{ type: 'enterprise', id: 'E2001', share: 100 }],
      startDate: '2026-09-20',
      endDate: '2026-10-20',
      description: '需要一位熟悉 TDesign 小程序生态的前端，完成社区数据看板的图表与导出功能，周期约 3 周。',
      milestones: [
        { name: '项目立项', date: '2026-09-20', owners: ['E2001'] },
        { name: '预期交付', date: '2026-10-20', owners: ['E2001'] },
      ],
      expReward: 100,
    }
    const r = await fetch('/api/admin/demands/D4014/initiate-project', { method: 'POST', headers: h, body: JSON.stringify(body) })
    const out = { status: r.status, body: (await r.text()).slice(0, 200) }
    const d = await fetch('/api/admin/demands?keyword=D4014&page=1&pageSize=3', { headers: h })
    const dj = await d.json()
    const row = dj.data?.list?.[0] ?? {}
    out.demand = { status: row.status, projectId: row.projectId, matchedRespondent: row.matchedRespondent }
    return JSON.stringify(out)
  })
}
