async page => {
  return await page.evaluate(() => {
    const switches = [...document.querySelectorAll('.t-switch')]
    return JSON.stringify(switches.map((s, i) => ({ i, cls: s.className, visible: s.offsetParent !== null })))
  })
}
