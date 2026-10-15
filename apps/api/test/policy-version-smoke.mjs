// Rollback-only PostgreSQL regression: no reseed, migration, ID allocation or audit writes.
// Run from apps/api: node test/policy-version-smoke.mjs
import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const prefix = `T${randomBytes(6).toString('hex')}`
const ids = ['C1', 'C2', 'A1', 'A2', 'P1', 'D1'].map(suffix => prefix + suffix)
const version = `reg-${randomBytes(5).toString('hex')}`
const rollback = new Error('rollback successful policy checks')
const record = (id, kind, version, status = 'published') => ({
  id, kind, version, status, title: '事务回滚政策回归测试', content: '<p>测试正文</p>',
  publishedAt: '2026-10-15 18:30', updatedAt: '2026-10-15 18:30',
})

try {
  const indexes = await db.$queryRaw`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'Policy' AND indexname LIKE 'Policy%version%key'`
  assert.equal(indexes.some(index => index.indexname === 'Policy_published_kind_version_key'), false)
  const index = indexes.find(index => index.indexname === 'Policy_published_agreement_kind_version_key')
  assert.ok(index?.indexdef.includes('agreement_user') && index.indexdef.includes('agreement_privacy'))
  try {
    await db.$transaction(async tx => {
      await tx.policy.create({ data: record(ids[0], 'community', '1.0') })
      await tx.policy.create({ data: record(ids[1], 'community', '1.0') })
      await tx.policy.update({ where: { id: ids[1] }, data: { version: '1.0', title: '同版本编辑测试' } })
      await tx.policy.create({ data: record(ids[2], 'agreement_user', version) })
      await tx.policy.create({ data: record(ids[3], 'agreement_user', version, 'archived') })
      await tx.policy.create({ data: record(ids[4], 'agreement_privacy', version) })
      const expectConflict = async action => {
        await tx.$executeRaw`SAVEPOINT policy_probe`
        let failure
        try { await action() } catch (error) { failure = error }
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT policy_probe`
        await tx.$executeRaw`RELEASE SAVEPOINT policy_probe`
        assert.ok(failure instanceof Prisma.PrismaClientKnownRequestError && failure.code === 'P2002')
      }
      await expectConflict(() => tx.policy.create({ data: record(ids[5], 'agreement_user', version) }))
      await expectConflict(() => tx.policy.update({ where: { id: ids[3] }, data: { status: 'published' } }))
      assert.equal(await tx.policy.count({ where: { id: { in: ids } } }), 5)
      throw rollback
    })
  } catch (error) { if (error !== rollback) throw error }
  assert.equal(await db.policy.count({ where: { id: { in: ids } } }), 0)
  console.log('PASS: same-version community create/update; agreement duplicate create/republish protection; all probes rolled back (0 test rows remain).')
} finally { await db.$disconnect() }
