async page => {
  const body = await page.locator('body').innerText()
  return JSON.stringify({
    hasInvest: body.includes('AI 质检 SaaS 天使轮融资'),
    hasCoop: body.includes('寻找智能制造渠道合作伙伴'),
    investTypeTag: body.includes('找投资'),
    coopTypeTag: body.includes('找合作'),
  })
}
