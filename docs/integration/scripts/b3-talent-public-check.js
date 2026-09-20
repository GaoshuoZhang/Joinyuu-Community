async page => {
  const api = await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const r = await fetch('/api/app/community/talents?page=1&pageSize=10', { headers: { Authorization: 'Bearer ' + t } })
    const j = await r.json()
    const list = j.data?.list ?? []
    const me = list.find(x => x.uid === 'U1001')
    return { total: j.data?.total, uids: list.map(x => x.uid), me: me ? { displayName: me.displayName, skills: me.skills, industryExperience: me.industryExperience } : null }
  })
  await page.goto('http://localhost:7759/talents/U1001')
  await page.waitForTimeout(1500)
  const body = await page.locator('body').innerText()
  return JSON.stringify({
    api,
    publicCard: {
      hasName: body.includes('陈屿'),
      hasSkills: body.includes('大模型应用'),
      hasIndustry: body.includes('人工智能'),
      hasAge: body.includes('32'),
      hasPolitical: body.includes('群众'),
    },
  })
}
