/* M1-A 种子骨架 — AdminUser + SystemConfig + DictEntry
 * M1-B 起扩展为 M0 mock 全量迁移（编号与跨模块引用保持一致，见 docs/wiki-backend.md §11）
 * 幂等：清空后重建 */
import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

const DICTS: Record<string, Array<{ code: string; label: string; sort: number }>> = {
  demand_category: [
    { code: 'DC001', label: '供应链', sort: 1 },
    { code: 'DC002', label: '设计', sort: 2 },
    { code: 'DC003', label: '法务财务', sort: 3 },
    { code: 'DC004', label: '技术开发', sort: 4 },
    { code: 'DC005', label: '市场', sort: 5 },
    { code: 'DC006', label: '人力资源', sort: 6 },
  ],
  industry: [
    { code: 'IN001', label: '人工智能', sort: 1 },
    { code: 'IN002', label: '芯片半导体', sort: 2 },
    { code: 'IN003', label: '文化创意', sort: 3 },
    { code: 'IN004', label: '企业服务 SaaS', sort: 4 },
    { code: 'IN005', label: '新材料', sort: 5 },
    { code: 'IN006', label: '智慧交通', sort: 6 },
    { code: 'IN007', label: '设计服务', sort: 7 },
    { code: 'IN008', label: '商业航天', sort: 8 },
    { code: 'IN009', label: '医疗健康', sort: 9 },
    { code: 'IN010', label: '风险投资', sort: 10 },
    { code: 'IN011', label: '财务咨询', sort: 11 },
  ],
  event_type: [
    { code: 'ET001', label: '沙龙', sort: 1 },
    { code: 'ET002', label: '培训', sort: 2 },
    { code: 'ET003', label: '路演', sort: 3 },
    { code: 'ET004', label: '社交', sort: 4 },
    { code: 'ET005', label: '赛事', sort: 5 },
  ],
}

async function main() {
  await prisma.dictEntry.deleteMany()
  await prisma.systemConfig.deleteMany()
  await prisma.adminUser.deleteMany()

  await prisma.adminUser.create({
    data: {
      username: 'admin',
      passwordHash: await hash('admin123', 10),
      name: '社区管理员',
    },
  })

  await prisma.systemConfig.create({
    data: {
      id: 1,
      siteName: '聚屿社区',
      siteSlogan: '让每一座创业孤岛，在这里连成群岛。',
      registrationOpen: true,
      mallOpen: true,
      demandOpen: true,
      reservationOpen: true,
      dailyLoginPoints: false,
      leaseExpireRemindDays: 15,
      updatedAt: '2026-09-01 09:00',
      updatedBy: '系统初始化',
    },
  })

  for (const [type, entries] of Object.entries(DICTS)) {
    await prisma.dictEntry.createMany({
      data: entries.map((e) => ({ type, code: e.code, label: e.label, sort: e.sort, status: 'enabled' })),
    })
  }

  console.log('[seed] AdminUser(admin) + SystemConfig + DictEntry(3 类 %d 项) 写入完成', 6 + 11 + 5)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
