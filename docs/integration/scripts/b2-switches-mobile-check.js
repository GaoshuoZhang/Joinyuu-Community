async page => {
  const out = {}
  await page.goto('http://localhost:7759/')
  await page.waitForTimeout(1600)
  const homeText = await page.locator('body').innerText()
  out.homeText = {
    hasMallEntry: homeText.includes('积分商城'),
    hasSpaceEntry: homeText.includes('空间预约'),
    hasPublishDemand: homeText.includes('发布需求'),
  }
  out.api = await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const result = {}
    const cfg = await fetch('/api/app/config')
    const cfgj = await cfg.json()
    result.config = {
      mallOpen: cfgj.data?.mallOpen,
      demandOpen: cfgj.data?.demandOpen,
      reservationOpen: cfgj.data?.reservationOpen,
      homeCarouselOpen: cfgj.data?.homeCarouselOpen,
    }
    const home = await fetch('/api/app/home', { headers: h })
    const homej = await home.json()
    result.homeApi = { status: home.status, banners: Array.isArray(homej.data?.banners) ? homej.data.banners.length : homej.data?.banners, keys: Object.keys(homej.data ?? {}) }
    const mall = await fetch('/api/app/mall/goods?page=1&pageSize=5', { headers: h })
    result.mallList = { status: mall.status, body: (await mall.text()).slice(0, 120) }
    const respond = await fetch('/api/app/demands/D4007/respond', {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: '联调开关验证' }),
    })
    result.demandRespond = { status: respond.status, body: (await respond.text()).slice(0, 120) }
    const spaces = await fetch('/api/app/spaces', { headers: h })
    const spacesj = await spaces.json()
    result.spaces = { status: spaces.status, firstId: spacesj.data?.[0]?.id ?? spacesj.data?.[0]?.spaceId }
    const spaceId = result.spaces.firstId
    const reserve = await fetch('/api/app/spaces/reservations', {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceId, date: '2026-09-22', start: '10:00', end: '11:00' }),
    })
    result.reserve = { status: reserve.status, body: (await reserve.text()).slice(0, 120) }
    return result
  })
  return JSON.stringify(out)
}
