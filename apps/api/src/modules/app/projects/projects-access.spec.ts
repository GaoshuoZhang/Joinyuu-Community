import { AppProjectsService } from './projects.service'

function fixture() {
  const project = { id: 'P1', name: '企业需求项目', demanderId: 'E1', sourceDemandId: null,
    deletedAt: null, undertakers: [{ type: 'individual', refId: 'worker', name: '承接人' }],
    milestones: [{ id: 1, name: '交付', status: 'submitted', attachments: ['evidence.png'] }] }
  const prisma = {
    project: { findUnique: jest.fn().mockResolvedValue(project), findMany: jest.fn().mockResolvedValue([project]) },
    demand: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    enterprise: { findUnique: jest.fn().mockResolvedValue({ contactUserId: 'owner' }) },
    userIdentity: { findMany: jest.fn().mockImplementation(({ where }: { where: { userId: string } }) =>
      Promise.resolve(['member', 'owner'].includes(where.userId) ? [{ enterpriseId: 'E1' }] : [])) },
    milestone: { updateMany: jest.fn() },
  }
  const storage = { read: jest.fn().mockResolvedValue(Buffer.from('image')) }
  const service = new AppProjectsService(prisma as never, {} as never, {} as never, {} as never, storage as never)
  return { service, prisma, storage }
}

describe('企业项目读取与操作权限', () => {
  it('企业成员可以进入列表中的项目并读取证据，但不能验收或提交', async () => {
    const { service, prisma } = fixture()
    const list = await service.myProjects('member')
    expect(list[0].role).toBe('需求发起方')
    expect(prisma.project.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.arrayContaining([{ demanderId: { in: ['member', 'E1'] } }]) }),
    }))
    const detail = await service.projectDetail('member', 'P1')
    expect(detail).toMatchObject({ role: '需求发起方', canAccept: false, canSubmit: false })
    await expect(service.readAttachment('member', 'P1', 'evidence.png')).resolves.toMatchObject({ name: 'evidence.png' })
    await expect(service.acceptMilestone('member', 'P1', '1')).rejects.toThrow('仅发起方')
    await expect(service.returnMilestone('member', 'P1', '1', { reason: '修改' })).rejects.toThrow('仅发起方')
    await expect(service.submitMilestone('member', 'P1', '1', {})).rejects.toThrow('仅承接方')
    expect(prisma.milestone.updateMany).not.toHaveBeenCalled()
  })
  it('负责人和承接方分别保留已有操作能力', async () => {
    const { service } = fixture()
    await expect(service.projectDetail('owner', 'P1')).resolves.toMatchObject({ canAccept: true, canSubmit: false })
    await expect(service.projectDetail('worker', 'P1')).resolves.toMatchObject({ canAccept: false, canSubmit: true })
  })
  it('无关用户不能读取详情或附件，也不能下载未关联附件', async () => {
    const { service, storage } = fixture()
    await expect(service.projectDetail('stranger', 'P1')).rejects.toThrow('无权访问')
    await expect(service.readAttachment('stranger', 'P1', 'evidence.png')).rejects.toThrow('无权访问')
    await expect(service.readAttachment('member', 'P1', 'other.png')).rejects.toThrow('附件不存在')
    expect(storage.read).not.toHaveBeenCalled()
  })
})
