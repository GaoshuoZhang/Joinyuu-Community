async page => {
  return await page.evaluate(async () => {
    const r = await fetch('/api/public/files/47a875c2-e40e-47ff-a13d-2e6f6b49ab3c.png')
    const buf = await r.arrayBuffer()
    const bytes = new Uint8Array(buf.slice(0, 8))
    return {
      status: r.status,
      contentType: r.headers.get('content-type'),
      size: buf.byteLength,
      pngMagic: bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47,
    }
  })
}
