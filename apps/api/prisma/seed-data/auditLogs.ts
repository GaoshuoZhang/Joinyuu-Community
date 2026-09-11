import type { AuditLog } from '@/types'

/* 审计日志数据 — 命名前缀 AL1001+
 * 记录后台管理员的全部写操作（谁在何时对什么做了什么）。
 * M0：种子数据 + recordAudit 埋点（见 api/auditLogs.ts，已埋入各域关键写接口）；
 * M1：统一由服务端中间件记录，含 IP 与变更前后快照 */
export const auditLogs: AuditLog[] = [
  { id: 'AL1001', operator: '社区管理员', module: '系统管理', action: '系统初始化', target: '系统配置', at: '2026-09-01 09:00' },
  { id: 'AL1002', operator: '社区管理员', module: '系统管理', action: '保存等级梯度', target: '等级规则（5 级）', at: '2026-09-01 09:10' },
  { id: 'AL1003', operator: '社区管理员', module: '积分商城', action: '编辑积分规则', target: 'activity_checkin · 活动签到', detail: '积分 10 → 15', at: '2026-09-02 10:20' },
  { id: 'AL1004', operator: '社区管理员', module: '社区成员', action: '冻结账号', target: 'U1014 · 方致远', detail: '长期冻结 · 违规接单行为', at: '2026-09-03 11:05' },
  { id: 'AL1005', operator: '社区管理员', module: '需求管理', action: '需求发布', target: 'D4004 · 社区小程序前端开发合作', at: '2026-09-06 17:12' },
  { id: 'AL1006', operator: '社区管理员', module: '需求管理', action: '需求发布', target: 'D4002 · SaaS 控制台 UI 设计外包', at: '2026-09-06 11:28' },
  { id: 'AL1007', operator: '社区管理员', module: '需求管理', action: '需求驳回', target: 'D4012 · 低价接一切网站开发私活', detail: '与社区定位不符，禁止低价引流', at: '2026-09-06 10:30' },
  { id: 'AL1008', operator: '社区管理员', module: '项目管理', action: '新增项目', target: 'P5008 · 社区品牌联名周边', at: '2026-09-05 15:00' },
  { id: 'AL1009', operator: '社区管理员', module: '审核中心', action: '审核通过', target: 'AP3006 · 木白设计工作室', detail: '入驻申请', at: '2026-09-05 16:00' },
  { id: 'AL1010', operator: '社区管理员', module: '空间管理', action: '新增租约', target: 'LS2006 · 木白设计工作室', detail: 'A-05、A-06', at: '2026-09-05 16:10' },
  { id: 'AL1011', operator: '社区管理员', module: '活动管理', action: '活动发布', target: 'EV6005 · 设计思维工作坊：从用户访谈到原型', at: '2026-09-04 09:00' },
  { id: 'AL1012', operator: '社区管理员', module: '活动管理', action: '活动取消', target: 'EV6008 · 创业心理舒缓小组（第 3 期）', at: '2026-09-04 14:30' },
  { id: 'AL1013', operator: '社区管理员', module: '空间管理', action: '新增空间', target: 'S1006 · 岛屿自习室', at: '2026-09-03 10:00' },
  { id: 'AL1014', operator: '社区管理员', module: '空间管理', action: '空间维护登记', target: 'S1003 · 共享会议室 B', at: '2026-09-03 15:40' },
  { id: 'AL1015', operator: '社区管理员', module: '积分商城', action: '积分调整', target: 'U1001 · 陈屿', detail: '+200 活动嘉宾感谢', at: '2026-09-06 09:00' },
  { id: 'AL1016', operator: '社区管理员', module: '内容管理', action: '文章驳回', target: 'SU1009 · 独立开发者接单指南', detail: '缺少社区案例引用', at: '2026-09-05 11:00' },
  { id: 'AL1017', operator: '社区管理员', module: '内容管理', action: '展示页审核通过', target: 'SC1003 · 云径网络', at: '2026-09-04 10:00' },
  { id: 'AL1018', operator: '社区管理员', module: '空间管理', action: '预约审核通过', target: 'SR2009 · 聚屿路演厅', at: '2026-09-04 09:20' },
  { id: 'AL1019', operator: '社区管理员', module: '空间管理', action: '预约审核驳回', target: 'SR2007 · 洽谈室 01', detail: '时段与社区活动冲突', at: '2026-09-03 17:00' },
  { id: 'AL1020', operator: '社区管理员', module: '积分商城', action: '订单发货', target: 'RO2001 · 会议室优先预约卡', at: '2026-09-01 10:00' },
  { id: 'AL1021', operator: '社区管理员', module: '积分商城', action: '订单取消', target: 'RO2006 · 精品咖啡券（单杯）', detail: '积分已退回 U1014', at: '2026-09-02 15:00' },
  { id: 'AL1022', operator: '社区管理员', module: '社区成员', action: '解冻账号', target: 'U1009 · 白若溪', at: '2026-09-02 09:30' },
  { id: 'AL1023', operator: '社区管理员', module: '需求管理', action: '新增需求', target: 'D4014 · 社区联营咖啡角设备采购', at: '2026-09-02 16:00' },
  { id: 'AL1024', operator: '社区管理员', module: '项目管理', action: '项目暂停', target: 'P5006 · 智慧园区访客系统试点', at: '2026-09-01 14:00' },
  { id: 'AL1025', operator: '社区管理员', module: '规则管理', action: '停用经验值规则', target: 'daily_login · 每日登录', at: '2026-09-01 09:30' },
]
