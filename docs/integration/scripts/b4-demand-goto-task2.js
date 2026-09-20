async page => {
  const info = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('button')].filter(b => b.innerText.includes('找服务'))
    const card = cards[cards.length - 1]
    const btn = [...card.querySelectorAll('button')].find(b => b.innerText.includes('发布需求'))
    if (!btn) return { found: false }
    btn.click()
    return { found: true, tag: btn.tagName }
  })
  await page.waitForTimeout(1600)
  return JSON.stringify({ info, url: page.url() })
}
