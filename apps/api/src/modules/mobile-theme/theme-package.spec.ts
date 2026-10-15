import { buildThemeZip as zip } from '../../../test/helpers/theme-zip'
import { readThemeZip, validateManifest } from './theme-package'

const manifest = { schemaVersion: 1, id: 'customer-a', name: '客户 A', version: '1.0.0' }
const entry = (value: unknown = manifest): [string, Buffer] => ['manifest.json', Buffer.from(JSON.stringify(value))]

describe('mobile theme package boundary', () => {
  it('accepts a real config-only ZIP', async () => {
    const result = await readThemeZip(zip([entry()]))
    expect(result.manifest).toEqual(manifest)
    expect(result.assets.size).toBe(0)
  })
  it.each([
    { ...manifest, schemaVersion: 2 },
    { ...manifest, tokens: { light: { primary: 'red;display:none' } } },
    { ...manifest, layout: { homeModules: ['entries', 'entries'] } },
    { ...manifest, layout: { homeModules: ['unknown-feature'] } },
    { ...manifest, layout: { template: ['brand'] } },
    { ...manifest, tokens: { radius: ['large'] } },
    { ...manifest, script: 'alert(1)' },
    { ...manifest, brand: { logo: 'https://example.com/logo.png' } },
  ])('rejects unsupported or executable configuration %#', (value) => expect(() => validateManifest(value)).toThrow())
  it.each(['../outside.png', 'assets/../../outside.png', 'assets/code.js', 'assets/logo.svg', 'wrapper/manifest.json'])('rejects unwanted ZIP paths: %s', async (path) => {
    await expect(readThemeZip(zip([entry(), [path, Buffer.from('payload')]]))).rejects.toThrow()
  })
  it('rejects duplicate manifest entries', async () => {
    await expect(readThemeZip(zip([entry(), entry()]))).rejects.toThrow('重复')
  })
  it('rejects missing resources and disguised images', async () => {
    await expect(readThemeZip(zip([entry({ ...manifest, brand: { logo: 'assets/logo.png' } })]))).rejects.toThrow('缺少')
    await expect(readThemeZip(zip([entry(), ['assets/logo.png', Buffer.from('<script>alert(1)</script>')]]))).rejects.toThrow('不匹配')
  })
  it('rejects excessive entry size and entry counts', async () => {
    await expect(readThemeZip(zip([entry(), ['assets/huge.png', Buffer.alloc(2 * 1024 * 1024 + 1)]]))).rejects.toThrow('超限')
    const entries: [string, Buffer][] = Array.from({ length: 101 }, (_, i) => [`assets/${i}.png`, Buffer.alloc(0)])
    await expect(readThemeZip(zip(entries))).rejects.toThrow('100')
  })
  it('rejects malformed ZIP and JSON', async () => {
    await expect(readThemeZip(Buffer.from('not-a-zip'))).rejects.toThrow()
    await expect(readThemeZip(zip([['manifest.json', Buffer.from('{')]]))).rejects.toThrow('JSON')
  })
})
