async page => {
  return await page.evaluate(async () => {
    const t = localStorage.getItem('joinyuu_client_token') ?? ''
    const r = await fetch('/api/app/application-form/individual', { headers: { Authorization: 'Bearer ' + t } })
    const j = await r.json()
    return JSON.stringify({
      status: r.status,
      data: j.data
        ? {
            type: j.data.type,
            subtitle: j.data.subtitle,
            submitLabel: j.data.submitLabel,
            fields: (j.data.fields ?? []).map(f => ({ key: f.key, label: f.label, type: f.type, required: f.required, options: f.options?.map(o => o.value) })),
          }
        : null,
      message: j.message,
    })
  })
}
