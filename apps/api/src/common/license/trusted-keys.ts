import publicKeys from './license-public-keys.json'

// Shipped with the backend. Environment variables and license uploads cannot replace trust roots.
const keys: Readonly<Record<string, string>> = Object.freeze({ ...publicKeys })
export function getTrustedLicenseKeys(): Readonly<Record<string, string>> { return keys }
