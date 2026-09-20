async page => {
  return await page.evaluate(() => {
    const els = [...document.querySelectorAll('input, textarea')]
    return JSON.stringify(els.map((e, i) => ({ i, tag: e.tagName, ph: e.getAttribute('placeholder'), visible: e.offsetParent !== null, value: e.value })))
  })
}
