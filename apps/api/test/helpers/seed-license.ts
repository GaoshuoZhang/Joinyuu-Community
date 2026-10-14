/** Ephemeral test-only signer, never trusted by production. No licensing bypass in app code. */
import { PrismaClient } from '@prisma/client'
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { assertSafeTestEnvironment } from '../../src/common/testing/test-environment'
import { PRODUCT_ID } from '../../src/common/license/license-format'

async function main() {
  assertSafeTestEnvironment()
  const path = process.env.E2E_LICENSE_PUBLIC_KEYS_FILE
  if (!path || !path.includes('joinyuu-license-test-')) throw new Error('必须使用专用临时测试公钥文件')
  const prisma = new PrismaClient()
  try {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    writeFileSync(path, JSON.stringify({ test: publicKey.export({ type: 'spki', format: 'pem' }).toString() }))
    const deploymentId = randomUUID()
    const payload = Buffer.from(JSON.stringify({
      version: 1, productId: PRODUCT_ID, deploymentId, licenseId: randomUUID(), customerId: 'test', customerName: '隔离测试', keyId: 'test',
      issuedAt: new Date(Date.now() - 1000).toISOString(), notBefore: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(), updatesUntil: null,
    }))
    const document = { payload: payload.toString('base64url'), signature: sign(null, payload, privateKey).toString('base64url') }
    await prisma.deploymentLicense.upsert({ where: { id: 'default' }, create: { id: 'default', deploymentId, document }, update: { deploymentId, document } })
  } finally { await prisma.$disconnect() }
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
