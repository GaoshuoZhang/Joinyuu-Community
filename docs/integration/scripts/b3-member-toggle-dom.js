async page => {
  return await page.evaluate(() => {
    const label = [...document.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent === '发布需求')
    if (!label) return JSON.stringify({ found: false })
    let node = label
    for (let i = 0; i < 4 && node.parentElement; i++) node = node.parentElement
    return JSON.stringify({ found: true, html: node.outerHTML.slice(0, 600) })
  })
}
