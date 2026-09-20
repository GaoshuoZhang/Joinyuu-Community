async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const h = { Authorization: 'Bearer ' + t }
    const schema = await fetch('/api/app/card-schema/enterprise', { headers: h })
    const sj = await schema.json()
    const detail = await fetch('/api/app/me/enterprises/E2001', { headers: h })
    const dj = await detail.json()
    const cards = await fetch('/api/app/me/cards', { headers: h })
    const cj = await cards.json()
    return JSON.stringify({
      schema: { status: schema.status, fields: sj.data?.editableFields ?? sj.data },
      detail: { status: detail.status, keys: Object.keys(dj.data ?? {}), name: dj.data?.name, services: dj.data?.services, advantages: dj.data?.advantages, logo: dj.data?.logo },
      cards: { status: cards.status, keys: cj.data ? Object.keys(cj.data) : null },
    })
  })
}
