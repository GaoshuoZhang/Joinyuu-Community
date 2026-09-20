async page => {
  return await page.evaluate(() => {
    const heading = [...document.querySelectorAll('*')].find(el => el.children.length === 0 && el.textContent === '找服务')
    if (!heading) return JSON.stringify({ found: false })
    let node = heading
    for (let i = 0; i < 3 && node.parentElement; i++) node = node.parentElement
    return JSON.stringify({ tag: node.tagName, html: node.outerHTML.slice(0, 900) })
  })
}
