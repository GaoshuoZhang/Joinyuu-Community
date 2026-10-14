import { getTrustedLicenseKeys } from './trusted-keys'

it('backend trust roots are immutable and unaffected by the legacy environment setting', () => {
  const previous = process.env.LICENSE_PUBLIC_KEYS_FILE
  try {
    process.env.LICENSE_PUBLIC_KEYS_FILE = 'nonexistent/untrusted.json'
    const keys = getTrustedLicenseKeys()
    expect(Object.isFrozen(keys)).toBe(true)
    expect(keys['vendor-2026']).toContain('BEGIN PUBLIC KEY')
  } finally {
    if (previous === undefined) delete process.env.LICENSE_PUBLIC_KEYS_FILE
    else process.env.LICENSE_PUBLIC_KEYS_FILE = previous
  }
})
