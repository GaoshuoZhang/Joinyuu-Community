/* 权限点目录（RBAC 前端契约先行，后端目录接口对齐）
 * code 沿用菜单路径（'/users'），按钮级权限预留 'perm:xxx' 扩展位。
 * 登录未返回权限时授予全部（FALLBACK），否则以登录响应为准。 */

export interface PermissionItem {
  code: string
  name: string
}

export interface PermissionGroup {
  name: string
  perms: PermissionItem[]
}

export const permissionGroups: PermissionGroup[] = [
  { name: '工作台', perms: [{ code: '/dashboard', name: '工作台' }] },
  {
    name: '社区成员',
    perms: [
      { code: '/users', name: '用户管理' },
      { code: '/individuals', name: '社区个体' },
      { code: '/enterprises', name: '社区企业' },
      { code: 'perm:enterprise:create', name: '新增企业' },
      { code: 'perm:enterprise:update', name: '编辑企业' },
      { code: 'perm:enterprise:disable', name: '停用企业' },
      { code: 'perm:enterprise:enable', name: '启用企业' },
      { code: 'perm:enterprise:delete', name: '删除企业' },
      { code: '/external-enterprises', name: '合作企业' },
      { code: 'perm:external-enterprise:create', name: '新增合作企业' },
      { code: 'perm:external-enterprise:update', name: '编辑合作企业' },
      { code: 'perm:external-enterprise:disable', name: '停用合作企业' },
      { code: 'perm:external-enterprise:enable', name: '启用合作企业' },
      { code: 'perm:external-enterprise:delete', name: '删除合作企业' },
      { code: '/approvals', name: '申请审核' },
    ],
  },
  {
    name: '业务运营',
    perms: [
      { code: '/demands', name: '需求管理' },
      { code: '/demands/review', name: '需求审核' },
      { code: '/projects', name: '项目管理' },
      { code: '/events', name: '活动管理' },
    ],
  },
  {
    name: '空间管理',
    perms: [
      { code: '/workstations', name: '办公位管理' },
      { code: '/workstations/offices', name: '办公室管理' },
      { code: '/workstations/leases', name: '租赁管理' },
      { code: '/spaces', name: '公共空间管理' },
      { code: '/spaces/reservations', name: '公共空间预约' },
    ],
  },
  {
    name: '内容管理',
    perms: [
      { code: '/contents/publish', name: '资讯发布' },
      { code: '/contents/submissions', name: '投稿内容' },
      { code: '/contents/columns', name: '栏目管理' },
      { code: '/contents/stats', name: '阅读统计' },
      { code: '/contents/showcase', name: '展示页发布' },
      { code: '/contents/announcements', name: '公告栏' },
    ],
  },
  {
    name: '积分管理',
    perms: [
      { code: '/mall/goods', name: '商品管理' },
      { code: '/mall/orders', name: '订单管理' },
    ],
  },
  {
    name: '规则管理',
    perms: [
      { code: '/rules/points', name: '积分规则' },
      { code: '/rules/experience', name: '经验值规则' },
      { code: '/rules/levels', name: '等级规则' },
      { code: '/rules/ledger', name: '积分发放记录' },
      { code: '/rules/experience-records', name: '经验值发放记录' },
    ],
  },
  {
    name: '系统管理',
    perms: [
      { code: '/system/dicts', name: '数据字典' },
      { code: '/system/config', name: '系统配置' },
      { code: '/logs/audit', name: '操作日志' },
      { code: '/system/roles', name: '角色权限' },
      { code: '/system/admins', name: '管理员账号' },
      { code: '/system/sessions', name: '在线会话' },
      { code: '/system/assets', name: '素材库' },
      { code: '/system/monitor', name: '系统监控' },
      { code: '/logs/login', name: '登录日志' },
      { code: '/system/trash', name: '归档管理' },
      { code: '/system/export', name: '数据导出' },
      { code: '/governance', name: '信任治理' },
    ],
  },
]

/** 全部权限码（超管兜底） */
export function getAllPermissionCodes(): string[] {
  const set = new Set<string>()
  for (const g of permissionGroups) for (const p of g.perms) set.add(p.code)
  return [...set]
}

/** '*'(超管) 或包含该权限码；传入数组时任一命中即通过 */
export function hasPermission(permissions: string[], code: string | string[]): boolean {
  if (permissions.includes('*')) return true
  if (Array.isArray(code)) return code.some((c) => permissions.includes(c))
  return permissions.includes(code)
}
