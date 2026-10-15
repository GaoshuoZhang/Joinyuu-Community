import { ConflictException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { GovernanceService } from './governance.service'

const data = { title: '社区政策', content: '<p>政策正文</p>', version: '1.0', status: 'published' as const }
const duplicate = (target: string[] | string = ['kind', 'version']) => new Prisma.PrismaClientKnownRequestError('duplicate', {
  code: 'P2002', clientVersion: '6.19.3', meta: { modelName: 'Policy', target },
})
function fixture() {
  const policy = { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data }) => data), update: jest.fn().mockResolvedValue({}) }
  const ids = { next: jest.fn().mockResolvedValue('PL-test') }
  const audit = { record: jest.fn().mockResolvedValue(undefined) }
  return { policy, ids, audit, service: new GovernanceService({ policy } as never, ids as never, audit as never) }
}

describe('policy version boundaries', () => {
  it('allows distinct published community documents to use the same version', async () => {
    const { service, policy } = fixture()
    await service.createCommunityPolicy(data, 'operator')
    await service.createCommunityPolicy({ ...data, title: '另一份政策' }, 'operator')
    expect(policy.create).toHaveBeenCalledTimes(2)
    expect(policy.findFirst).not.toHaveBeenCalled()
    expect(policy.create.mock.calls.map(([call]) => call.data.version)).toEqual(['1.0', '1.0'])
  })
  it('rejects a duplicate published agreement before allocating an ID or writing', async () => {
    const { service, policy, ids, audit } = fixture()
    policy.findFirst.mockResolvedValue({ id: 'existing' })
    await expect(service.createAgreementPolicy({ ...data, kind: 'agreement_user' }, 'operator')).rejects.toBeInstanceOf(ConflictException)
    expect(policy.findFirst).toHaveBeenCalledWith({ where: { kind: 'agreement_user', version: '1.0', status: 'published' }, select: { id: true } })
    expect(ids.next).not.toHaveBeenCalled()
    expect(policy.create).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
  })
  it('allows archived agreements with an existing version', async () => {
    const { service, policy } = fixture()
    await service.createAgreementPolicy({ ...data, kind: 'agreement_privacy', status: 'archived' }, 'operator')
    expect(policy.findFirst).not.toHaveBeenCalled()
    expect(policy.create).toHaveBeenCalledTimes(1)
  })
  it('excludes the edited agreement itself from duplicate detection', async () => {
    const { service, policy } = fixture()
    policy.findFirst.mockResolvedValueOnce({ id: 'PL1', ...data }).mockResolvedValueOnce(null)
    await service.updateAgreementPolicy('PL1', { ...data, kind: 'agreement_user' }, 'operator')
    expect(policy.findFirst).toHaveBeenLastCalledWith({ where: { kind: 'agreement_user', version: '1.0', status: 'published', id: { not: 'PL1' } }, select: { id: true } })
    expect(policy.update).toHaveBeenCalledTimes(1)
  })
  it('rejects republishing an archived version when another matching version is published', async () => {
    const { service, policy, audit } = fixture()
    policy.findFirst.mockResolvedValueOnce({ id: 'PL1', status: 'archived' }).mockResolvedValueOnce({ id: 'PL2' })
    await expect(service.updateAgreementPolicy('PL1', { ...data, kind: 'agreement_user' }, 'operator')).rejects.toBeInstanceOf(ConflictException)
    expect(policy.update).not.toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
  })
  it.each([{ target: ['kind', 'version'] }, { target: 'Policy_published_agreement_kind_version_key' }])('translates concurrent agreement creation conflicts for target %j', async ({ target }) => {
    const { service, policy, audit } = fixture()
    policy.create.mockRejectedValue(duplicate(target))
    await expect(service.createAgreementPolicy({ ...data, kind: 'agreement_privacy' }, 'operator')).rejects.toMatchObject({ status: 409 })
    expect(audit.record).not.toHaveBeenCalled()
  })
  it('also catches a version conflict after the update precheck', async () => {
    const { service, policy } = fixture()
    policy.findFirst.mockResolvedValueOnce({ id: 'PL1' }).mockResolvedValueOnce(null)
    policy.update.mockRejectedValue(duplicate())
    await expect(service.updateAgreementPolicy('PL1', { ...data, kind: 'agreement_user' }, 'operator')).rejects.toBeInstanceOf(ConflictException)
  })
  it('does not mislabel primary-key failures as an agreement-version conflict', async () => {
    const { service, policy } = fixture()
    const error = duplicate(['id'])
    policy.create.mockRejectedValue(error)
    await expect(service.createCommunityPolicy(data, 'operator')).rejects.toBe(error)
  })
  it('preserves missing-policy handling', async () => {
    const { service, policy } = fixture()
    await expect(service.updateCommunityPolicy('missing', data, 'operator')).rejects.toBeInstanceOf(NotFoundException)
    expect(policy.update).not.toHaveBeenCalled()
  })
})
