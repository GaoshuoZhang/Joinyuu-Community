import { Prisma } from '@prisma/client'
import type { PrismaService } from '../../common/prisma/prisma.service'
import type { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import type { AuditService } from '../../common/audit/audit.service'
import type { AssetsService } from '../assets/assets.service'
import {
  LEASE_PRINT_DEFAULT_TITLE,
  LEASE_PRINT_FIELD_KEYS,
  WorkstationsService,
  splitLeasePrintClauses,
  toLeasePrintLayoutDto,
} from './workstations.service'

/** 「租赁信息」栏目键集契约：与 apps/admin/src/constants/leasePrintLayout.ts 一一对应，改动必须两端同步 */
const EXPECTED_FIELD_KEYS = [
  'renterName',
  'renterType',
  'contactName',
  'contactPhone',
  'workstation',
  'leaseTerm',
  'rentPeriod',
  'rent',
  'status',
  'terminatedAt',
]

function buildService(prisma: unknown, audit: unknown = { record: jest.fn() }) {
  return new WorkstationsService(
    prisma as PrismaService,
    {} as IdGeneratorService,
    audit as AuditService,
    {} as AssetsService,
  )
}

describe('WorkstationsService 租约打印版式', () => {
  it('栏目键集与前端目录一致（防漂移）', () => {
    expect([...LEASE_PRINT_FIELD_KEYS]).toEqual(EXPECTED_FIELD_KEYS)
  })

  it('无配置记录时回落默认版式：默认标题 + 全部栏目启用 + 条款留空', async () => {
    const prisma = { leasePrintLayout: { findUnique: jest.fn().mockResolvedValue(null) } }
    const layout = await buildService(prisma).getLeasePrintLayout()

    expect(layout.title).toBe(LEASE_PRINT_DEFAULT_TITLE)
    expect(Object.keys(layout.fields)).toEqual(EXPECTED_FIELD_KEYS)
    expect(Object.values(layout.fields).every(Boolean)).toBe(true)
    expect(layout.clausesText).toBe('')
  })

  it('读取时：已存的 false 生效、缺键补 true、未知键忽略', () => {
    const layout = toLeasePrintLayoutDto({
      title: '  自定义单据  ',
      fields: { contactPhone: false, workstation: false, 不存在的键: false } as Prisma.JsonValue,
      clausesText: '第一条\n第二条',
    })

    expect(layout.title).toBe('自定义单据')
    expect(layout.fields.contactPhone).toBe(false)
    expect(layout.fields.workstation).toBe(false)
    expect(layout.fields.renterName).toBe(true)
    expect(Object.keys(layout.fields)).toEqual(EXPECTED_FIELD_KEYS)
    expect(layout.clausesText).toBe('第一条\n第二条')
  })

  it('表未迁移（P2021）时降级为默认版式，不抛错', async () => {
    const missingTable = new Prisma.PrismaClientKnownRequestError('表不存在', {
      code: 'P2021',
      clientVersion: '6.0.0',
    })
    const prisma = { leasePrintLayout: { findUnique: jest.fn().mockRejectedValue(missingTable) } }
    const layout = await buildService(prisma).getLeasePrintLayout()

    expect(layout.title).toBe(LEASE_PRINT_DEFAULT_TITLE)
    expect(Object.values(layout.fields).every(Boolean)).toBe(true)
  })

  it('局部更新：只传标题时保留原栏目与条款，并 upsert + 写审计', async () => {
    const upsert = jest.fn().mockResolvedValue({})
    const record = jest.fn().mockResolvedValue(undefined)
    const prisma = {
      leasePrintLayout: {
        findUnique: jest.fn().mockResolvedValue({
          title: '原标题',
          fields: { contactPhone: false },
          clausesText: '原有条款',
        }),
        upsert,
      },
    }
    const layout = await buildService(prisma, { record }).updateLeasePrintLayout(
      { title: '新标题' },
      '社区管理员',
    )

    expect(layout.title).toBe('新标题')
    expect(layout.fields.contactPhone).toBe(false)
    expect(layout.clausesText).toBe('原有条款')
    expect(upsert).toHaveBeenCalledTimes(1)
    const saved = upsert.mock.calls[0][0]
    expect(saved.where).toEqual({ id: 'default' })
    expect(saved.create.title).toBe('新标题')
    expect(record).toHaveBeenCalledTimes(1)
    expect(record.mock.calls[0][0]).toMatchObject({ action: '更新租约打印版式', operator: '社区管理员' })
  })

  it('全空白条款按未配置落库（clausesText 存 null）', async () => {
    const upsert = jest.fn().mockResolvedValue({})
    const prisma = {
      leasePrintLayout: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert,
      },
    }
    await buildService(prisma, { record: jest.fn() }).updateLeasePrintLayout({ clausesText: '   \n  ' }, '社区管理员')

    expect(upsert.mock.calls[0][0].create.clausesText).toBeNull()
  })

  it('条款说明按换行分段（忽略空行）；留空回落内置三条', () => {
    expect(splitLeasePrintClauses('第一条\n\n  第二条  \n第三条')).toEqual(['第一条', '第二条', '第三条'])
    expect(splitLeasePrintClauses('   \n\n ')).toHaveLength(3)
  })
})
