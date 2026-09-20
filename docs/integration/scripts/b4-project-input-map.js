async page => {
  return await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')].filter(e => e.offsetParent !== null)
    return JSON.stringify(inputs.map((e, i) => ({
      i,
      tag: e.tagName,
      type: e.type,
      ph: e.placeholder,
      value: e.value,
      parentText: (e.closest('.t-input, .t-input__wrap, div')?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 60),
    })))
  })
}
