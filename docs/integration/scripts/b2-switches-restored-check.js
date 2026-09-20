async page => {
  await page.goto('http://localhost:7759/')
  await page.waitForTimeout(1500)
  const t = await page.evaluate(() => localStorage.getItem('joinyuu_client_token') ?? '')
  const cfg = await page.evaluate(async token => {
    const r = await fetch('/api/app/config', { headers: { Authorization: 'Bearer ' + token } })
    const j = await r.json()
    return { mallOpen: j.data?.mallOpen, demandOpen: j.data?.demandOpen, reservationOpen: j.data?.reservationOpen, homeCarouselOpen: j.data?.homeCarouselOpen }
  }, t)
  const home = await page.evaluate(async token => {
    const r = await fetch('/api/app/home', { headers: { Authorization: 'Bearer ' + token } })
    const j = await r.json()
    return { banners: Array.isArray(j.data?.banners) ? j.data.banners.length : j.data?.banners, carouselEnabled: j.data?.carouselEnabled }
  }, t)
  const text = await page.locator('body').innerText()
  return JSON.stringify({
    cfg,
    home,
    hasMallEntry: text.includes('积分商城'),
    hasSpaceEntry: text.includes('空间预约'),
    hasPublishDemand: text.includes('发布需求'),
  })
}
