async page => {
  const result = await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const big = new Uint8Array(11 * 1024 * 1024)
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const fd = new FormData()
    fd.append('file', new File([big], 'big.png', { type: 'image/png' }))
    const r = await fetch('/api/app/uploads', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + t },
      body: fd,
    })
    return { status: r.status, body: await r.text() }
  })
  return JSON.stringify(result)
}
