async page => {
  return await page.evaluate(() => {
    const dialogs = [...document.querySelectorAll('.t-dialog')]
    return JSON.stringify({
      url: location.href,
      dialogs: dialogs.map(d => ({ visible: d.offsetParent !== null, text: (d.innerText ?? '').slice(0, 220) })),
    })
  })
}
