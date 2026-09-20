import type { Project } from '@/types'

/* 项目数据 — 命名前缀 P5001+
 * 模型：undertakers 承接方数组（可多个，各含承接占比，整数百分比合计 100）
 * 里程碑 owners = 负责该节点的承接方（存展示名，可多选）
 * initiatedAt = 立项日期（项目新增/立项时间） */
export const projects: Project[] = [
  {
    id: 'P5001',
    name: '聚屿小程序共研计划',
    code: 'JY-2026-01',
    undertakers: [
      { type: 'enterprise', id: 'E2001', name: '星澜智能科技', share: 40 },
      { type: 'enterprise', id: 'E2007', name: '木白设计工作室', share: 30 },
      { type: 'enterprise', id: 'E2004', name: '云径网络', share: 30 },
    ],
    status: 'running',
    progress: 62,
    startDate: '2026-07-01',
    endDate: '2026-10-31',
    initiatedAt: '2026-06-25',
    description:
      '社区自运营项目：为聚屿社区开发成员端小程序，涵盖活动报名、需求广场与积分商城入口。三家社区企业联合共研，社区提供场景与种子用户。',
    milestones: [
      { name: '需求梳理与立项', status: 'accepted', date: '2026-07-15', owners: ['星澜智能科技'], submitAt: '2026-07-13 18:00', acceptAt: '2026-07-15 10:00', attachments: ['project/P5001-需求梳理.pdf'] },
      { name: 'UI 设计定稿', status: 'accepted', date: '2026-08-20', owners: ['木白设计工作室'], submitAt: '2026-08-18 16:30', acceptAt: '2026-08-20 11:00', attachments: ['project/P5001-UI设计稿.pdf'] },
      { name: '开发与联调', status: 'todo', date: '2026-09-30', owners: ['星澜智能科技', '云径网络'] },
      { name: '社区内测', status: 'todo', date: '2026-10-15', owners: ['云径网络'] },
      { name: '正式发布', status: 'todo', date: '2026-10-31', owners: ['星澜智能科技'] },
    ],
    memberCount: 9,
  },
  {
    id: 'P5002',
    name: '社区开源组件库',
    code: 'JY-2026-02',
    undertakers: [
      { type: 'enterprise', id: 'E2001', name: '星澜智能科技', share: 50 },
      { type: 'enterprise', id: 'E2004', name: '云径网络', share: 50 },
    ],
    status: 'running',
    progress: 45,
    startDate: '2026-06-01',
    endDate: '2026-12-31',
    initiatedAt: '2026-05-28',
    description:
      '沉淀社区企业通用业务组件（TDesign 二次封装），开源给社区成员使用，目前已完成 18 个组件，目标 40 个。',
    milestones: [
      { name: '组件规范制定', status: 'accepted', date: '2026-06-20', owners: ['星澜智能科技'], submitAt: '2026-06-18 17:00', acceptAt: '2026-06-20 10:30' },
      { name: '基础组件 20 个', status: 'accepted', date: '2026-08-31', owners: ['星澜智能科技'], submitAt: '2026-08-29 18:30', acceptAt: '2026-08-31 11:00', attachments: ['project/P5002-基础组件清单.pdf'] },
      { name: '业务组件 20 个', status: 'todo', date: '2026-11-30', owners: ['云径网络'] },
      { name: 'v1.0 发布', status: 'todo', date: '2026-12-31', owners: ['星澜智能科技', '云径网络'] },
    ],
    memberCount: 6,
  },
  {
    id: 'P5003',
    name: '跨企业 AI 路演季',
    code: 'JY-2026-03',
    undertakers: [
      { type: 'enterprise', id: 'E2001', name: '星澜智能科技', share: 40 },
      { type: 'enterprise', id: 'E2004', name: '云径网络', share: 30 },
      { type: 'enterprise', id: 'E2008', name: '深空航天科技', share: 30 },
    ],
    status: 'running',
    progress: 15,
    startDate: '2026-09-15',
    endDate: '2026-11-15',
    initiatedAt: '2026-09-05',
    description:
      '社区第四届跨企业路演季，主题「AI 落地进行时」，招募 8-10 家企业参与，配套导师辅导与投资人闭门会。',
    milestones: [
      { name: '活动策划定稿', status: 'accepted', date: '2026-09-10', owners: ['星澜智能科技'], submitAt: '2026-09-08 16:00', acceptAt: '2026-09-10 10:00', attachments: ['project/P5003-路演季策划案.pdf'] },
      { name: '参与企业招募', status: 'todo', date: '2026-09-30', owners: ['云径网络'] },
      { name: '路演集训营', status: 'todo', date: '2026-10-25', owners: ['深空航天科技'] },
      { name: '路演日与闭门会', status: 'todo', date: '2026-11-15', owners: ['星澜智能科技', '云径网络'] },
    ],
    memberCount: 4,
  },
  {
    id: 'P5004',
    name: '半导体供应链对接专项',
    code: 'JY-2025-08',
    undertakers: [
      { type: 'enterprise', id: 'E2002', name: '芯启半导体', share: 50 },
      { type: 'enterprise', id: 'E2006', name: '逐浪出行', share: 30 },
      { type: 'enterprise', id: 'E2005', name: '沧岚新材料', share: 20 },
    ],
    status: 'finished',
    progress: 100,
    startDate: '2025-09-01',
    endDate: '2026-09-01',
    finishedAt: '2026-09-01',
    initiatedAt: '2025-08-20',
    description:
      '围绕硬科技企业的供应链互认专项：建立社区企业供应商互认清单与联合采购机制，共完成 3 轮对接，沉淀供应商 47 家。',
    milestones: [
      { name: '互认机制设计', status: 'accepted', date: '2025-10-15', owners: ['芯启半导体'], submitAt: '2025-10-13 17:00', acceptAt: '2025-10-15 09:30' },
      { name: '首轮对接会', status: 'accepted', date: '2025-12-20', owners: ['逐浪出行', '芯启半导体'], submitAt: '2025-12-18 18:00', acceptAt: '2025-12-20 12:00' },
      { name: '联合采购试运行', status: 'accepted', date: '2026-06-30', owners: ['沧岚新材料', '芯启半导体'], submitAt: '2026-06-28 17:30', acceptAt: '2026-06-30 10:00' },
      { name: '专项结项', status: 'accepted', date: '2026-09-01', owners: ['芯启半导体'], submitAt: '2026-08-30 16:00', acceptAt: '2026-09-01 14:00', attachments: ['project/P5004-结项报告.pdf'] },
    ],
    memberCount: 11,
  },
  {
    id: 'P5005',
    name: '社区品牌联名周边',
    code: 'JY-2026-04',
    undertakers: [
      { type: 'enterprise', id: 'E2007', name: '木白设计工作室', share: 40 },
      { type: 'enterprise', id: 'E2003', name: '拾光文创', share: 35 },
      { type: 'enterprise', id: 'E2009', name: '青柠健康', share: 25 },
    ],
    status: 'paused',
    progress: 30,
    startDate: '2026-08-01',
    endDate: '2026-12-20',
    initiatedAt: '2026-07-28',
    description:
      '社区一周年联名周边企划：帆布袋、徽章与笔记本三件套。因拾光文创内部排期调整，打样环节暂停，等待恢复。',
    milestones: [
      { name: '设计概念提案', status: 'accepted', date: '2026-08-20', owners: ['木白设计工作室'], submitAt: '2026-08-18 15:00', acceptAt: '2026-08-20 10:00' },
      { name: '打样与选品', status: 'returned', date: '2026-10-15', owners: ['拾光文创', '木白设计工作室'], returnedAt: '2026-09-12 17:00', returnReason: '拾光文创内部排期调整，打样暂停，待恢复后重新提交' },
      { name: '量产与发售', status: 'todo', date: '2026-12-20', owners: ['青柠健康'] },
    ],
    memberCount: 5,
  },
  {
    id: 'P5006',
    name: '青年创业者导师计划',
    code: 'JY-2026-05',
    undertakers: [
      { type: 'enterprise', id: 'E2004', name: '云径网络', share: 40 },
      { type: 'enterprise', id: 'E2002', name: '芯启半导体', share: 30 },
      { type: 'enterprise', id: 'E2001', name: '星澜智能科技', share: 30 },
    ],
    status: 'running',
    progress: 10,
    startDate: '2026-10-01',
    endDate: '2027-01-31',
    initiatedAt: '2026-08-28',
    description:
      '面向社区内成立 1 年以内企业的导师陪跑计划，8 位导师 × 8 支团队，每月一次闭门辅导，首期导师正在招募。',
    milestones: [
      { name: '导师招募', status: 'todo', date: '2026-09-30', owners: ['云径网络'] },
      { name: '团队遴选', status: 'todo', date: '2026-10-20', owners: ['云径网络'] },
      { name: '首期开营', status: 'todo', date: '2026-11-05', owners: ['星澜智能科技'] },
      { name: '结营路演', status: 'todo', date: '2027-01-31', owners: ['芯启半导体', '云径网络'] },
    ],
    memberCount: 3,
  },
  {
    id: 'P5007',
    name: '社区知识库共建',
    code: 'JY-2025-11',
    undertakers: [
      { type: 'enterprise', id: 'E2004', name: '云径网络', share: 40 },
      { type: 'enterprise', id: 'E2001', name: '星澜智能科技', share: 35 },
      { type: 'enterprise', id: 'E2007', name: '木白设计工作室', share: 25 },
    ],
    status: 'finished',
    progress: 100,
    startDate: '2025-11-01',
    endDate: '2026-06-30',
    finishedAt: '2026-06-30',
    initiatedAt: '2025-10-24',
    description:
      '沉淀社区方法论：融资、法务、增长、组织四大板块共 86 篇实战文档，全部向社区成员开放，累计阅读 12,000+。',
    milestones: [
      { name: '板块规划', status: 'accepted', date: '2025-11-30', owners: ['云径网络'], submitAt: '2025-11-28 16:00', acceptAt: '2025-11-30 10:00' },
      { name: '内容征集与评审', status: 'accepted', date: '2026-05-31', owners: ['星澜智能科技', '木白设计工作室'], submitAt: '2026-05-29 18:00', acceptAt: '2026-05-31 11:30' },
      { name: '知识库上线', status: 'accepted', date: '2026-06-30', owners: ['云径网络'], submitAt: '2026-06-28 17:00', acceptAt: '2026-06-30 10:00', attachments: ['project/P5007-知识库目录.pdf'] },
    ],
    memberCount: 14,
  },
  {
    id: 'P5008',
    name: '智慧园区访客系统试点',
    code: 'JY-2026-06',
    undertakers: [
      { type: 'enterprise', id: 'E2006', name: '逐浪出行', share: 60 },
      { type: 'enterprise', id: 'E2002', name: '芯启半导体', share: 40 },
    ],
    status: 'running',
    progress: 78,
    startDate: '2026-05-10',
    endDate: '2026-09-30',
    initiatedAt: '2026-05-06',
    description:
      '在聚屿社区试点访客预约与闸机联动系统，逐浪出行提供硬件与算法，试点通过后向其他园区复制推广。',
    milestones: [
      { name: '方案设计', status: 'accepted', date: '2026-06-01', owners: ['逐浪出行'], submitAt: '2026-05-30 17:00', acceptAt: '2026-06-01 10:00' },
      { name: '硬件安装', status: 'accepted', date: '2026-07-20', owners: ['逐浪出行', '芯启半导体'], submitAt: '2026-07-18 18:00', acceptAt: '2026-07-20 10:30' },
      { name: '试运行与调优', status: 'submitted', date: '2026-09-20', owners: ['逐浪出行'], submitAt: '2026-09-17 18:00', attachments: ['project/P5008-试运行记录.pdf'] },
      { name: '试点验收', status: 'todo', date: '2026-09-30', owners: ['芯启半导体'] },
    ],
    memberCount: 7,
  },
]
