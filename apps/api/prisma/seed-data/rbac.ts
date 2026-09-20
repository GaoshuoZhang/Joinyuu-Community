/* M1.5 R1 RBAC 种子 — 权限点目录（与前端 apps/admin/src/constants/permissions.ts 一致）
 * code：菜单路径（authType=menu）或 perm:xxx 按钮码（authType=button）；'*' 为超管全量标记 */

export interface SeedPermission {
  code: string
  name: string
  module: string
  authType: 'menu' | 'button'
  sort: number
}

export interface SeedRole {
  id: string
  code: string
  name: string
  description: string
  sort: number
  permCodes: string[]
  /** 数据范围（域维度），空数组=全部；域：members|biz|space|contents|mall|rules|system */
  dataScope?: string[]
}

export interface SeedAdminAccount {
  username: string
  name: string
  password: string
  status: 'active' | 'disabled'
  roleCodes: string[]
}

/* 权限点目录（按模块分组，sort 顺序即前端渲染顺序） */
export const permissionCatalog: SeedPermission[] = [
  { code: '/dashboard', name: '工作台', module: '工作台', authType: 'menu', sort: 1 },

  { code: '/users', name: '用户管理', module: '社区成员', authType: 'menu', sort: 10 },
  { code: '/individuals', name: '社区个体', module: '社区成员', authType: 'menu', sort: 11 },
  { code: '/enterprises', name: '社区企业', module: '社区成员', authType: 'menu', sort: 12 },
  { code: 'perm:enterprise:create', name: '新增企业', module: '社区成员', authType: 'button', sort: 13 },
  { code: 'perm:enterprise:update', name: '编辑企业', module: '社区成员', authType: 'button', sort: 14 },
  { code: 'perm:enterprise:disable', name: '停用企业', module: '社区成员', authType: 'button', sort: 15 },
  { code: 'perm:enterprise:enable', name: '启用企业', module: '社区成员', authType: 'button', sort: 16 },
  { code: 'perm:enterprise:delete', name: '删除企业', module: '社区成员', authType: 'button', sort: 17 },
  { code: '/external-enterprises', name: '合作企业', module: '社区成员', authType: 'menu', sort: 18 },
  { code: 'perm:external-enterprise:create', name: '新增合作企业', module: '社区成员', authType: 'button', sort: 19 },
  { code: 'perm:external-enterprise:update', name: '编辑合作企业', module: '社区成员', authType: 'button', sort: 20 },
  { code: 'perm:external-enterprise:disable', name: '停用合作企业', module: '社区成员', authType: 'button', sort: 21 },
  { code: 'perm:external-enterprise:enable', name: '启用合作企业', module: '社区成员', authType: 'button', sort: 22 },
  { code: 'perm:external-enterprise:delete', name: '删除合作企业', module: '社区成员', authType: 'button', sort: 23 },
  { code: '/approvals', name: '申请审核', module: '社区成员', authType: 'menu', sort: 24 },
  { code: '/member-governance', name: '注销治理', module: '社区成员', authType: 'menu', sort: 25 },
  { code: '/card-management', name: '名片管理', module: '社区成员', authType: 'menu', sort: 26 },

  { code: '/demands', name: '需求管理', module: '业务运营', authType: 'menu', sort: 30 },
  { code: '/demands/review', name: '需求审核', module: '业务运营', authType: 'menu', sort: 31 },
  { code: '/projects', name: '项目管理', module: '业务运营', authType: 'menu', sort: 32 },
  { code: '/events', name: '活动管理', module: '业务运营', authType: 'menu', sort: 33 },

  { code: '/workstations', name: '办公位管理', module: '空间管理', authType: 'menu', sort: 40 },
  { code: '/workstations/offices', name: '办公室管理', module: '空间管理', authType: 'menu', sort: 41 },
  { code: '/workstations/leases', name: '租赁管理', module: '空间管理', authType: 'menu', sort: 42 },
  { code: '/spaces', name: '公共空间管理', module: '空间管理', authType: 'menu', sort: 43 },
  { code: '/spaces/reservations', name: '公共空间预约', module: '空间管理', authType: 'menu', sort: 44 },

  { code: '/contents/publish', name: '资讯发布', module: '内容管理', authType: 'menu', sort: 50 },
  { code: '/contents/submissions', name: '投稿内容', module: '内容管理', authType: 'menu', sort: 51 },
  { code: '/contents/columns', name: '栏目管理', module: '内容管理', authType: 'menu', sort: 52 },
  { code: '/contents/stats', name: '阅读统计', module: '内容管理', authType: 'menu', sort: 53 },
  { code: '/contents/policies', name: '社区政策', module: '内容管理', authType: 'menu', sort: 54 },
  { code: '/contents/banners', name: '轮播图管理', module: '内容管理', authType: 'menu', sort: 55 },
  { code: '/contents/announcements', name: '公告栏', module: '内容管理', authType: 'menu', sort: 56 },

  { code: '/mall/goods', name: '商品管理', module: '积分管理', authType: 'menu', sort: 60 },
  { code: '/mall/orders', name: '订单管理', module: '积分管理', authType: 'menu', sort: 61 },

  { code: '/rules/points', name: '积分规则', module: '规则管理', authType: 'menu', sort: 70 },
  { code: '/rules/experience', name: '经验值规则', module: '规则管理', authType: 'menu', sort: 71 },
  { code: '/rules/levels', name: '等级规则', module: '规则管理', authType: 'menu', sort: 72 },
  { code: '/rules/ledger', name: '积分发放记录', module: '规则管理', authType: 'menu', sort: 73 },
  { code: '/rules/experience-records', name: '经验值发放记录', module: '规则管理', authType: 'menu', sort: 74 },
  { code: '/rules/publishing-limits', name: '发布限制', module: '规则管理', authType: 'menu', sort: 75 },

  { code: '/system/dicts', name: '数据字典', module: '系统管理', authType: 'menu', sort: 80 },
  { code: '/system/config', name: '系统配置', module: '系统管理', authType: 'menu', sort: 81 },
  { code: '/logs/audit', name: '操作日志', module: '系统管理', authType: 'menu', sort: 82 },
  { code: '/system/roles', name: '角色权限', module: '系统管理', authType: 'menu', sort: 83 },
  { code: '/system/admins', name: '管理员账号', module: '系统管理', authType: 'menu', sort: 84 },
  { code: '/system/sessions', name: '在线会话', module: '系统管理', authType: 'menu', sort: 85 },
  { code: '/system/assets', name: '素材库', module: '系统管理', authType: 'menu', sort: 86 },
  { code: '/system/monitor', name: '系统监控', module: '系统管理', authType: 'menu', sort: 87 },
  { code: '/logs/login', name: '登录日志', module: '系统管理', authType: 'menu', sort: 88 },
  { code: '/system/trash', name: '归档管理', module: '系统管理', authType: 'menu', sort: 89 },
  { code: '/system/export', name: '数据导出', module: '系统管理', authType: 'menu', sort: 90 },
  { code: '/system/policies', name: '协议与政策', module: '系统管理', authType: 'menu', sort: 94 },
]

/* 内置角色（超级管理员 '*' 全量；其余按模块授予） */
export const adminRoles: SeedRole[] = [
  {
    id: 'R1',
    code: 'super',
    name: '超级管理员',
    description: '全部模块全量权限',
    sort: 1,
    permCodes: ['*'],
  },
  {
    id: 'R2',
    code: 'operator',
    name: '运营',
    description: '业务运营 + 内容 + 商城。',
    sort: 2,
    permCodes: [
      '/dashboard',
      '/demands',
      '/demands/review',
      '/projects',
      '/events',
      '/contents/publish',
      '/contents/submissions',
      '/contents/columns',
      '/contents/stats',
      '/contents/policies',
      '/contents/banners',
      '/contents/announcements',
      '/mall/goods',
      '/mall/orders',
      '/rules/points',
      '/rules/ledger',
      '/card-management',
    ],
  },
  {
    id: 'R3',
    code: 'auditor',
    name: '审核',
    description: '审核与审核类操作',
    sort: 3,
    permCodes: ['/dashboard', '/approvals', '/member-governance', '/demands/review', '/spaces/reservations', '/logs/audit'],
  },
  {
    id: 'R4',
    code: 'space-ops',
    name: '空间运营',
    description: '仅空间域（数据范围示例）',
    sort: 4,
    dataScope: ['space'],
    permCodes: [
      '/dashboard',
      '/workstations',
      '/workstations/offices',
      '/workstations/leases',
      '/spaces',
      '/spaces/reservations',
    ],
  },
]

/* 内置管理员账号（开发种子；初始密码统一 admin123） */
export const adminAccounts: SeedAdminAccount[] = [
  { username: 'admin', name: '社区管理员', password: 'admin123', status: 'active', roleCodes: ['super'] },
  { username: 'operator', name: '运营专员', password: 'admin123', status: 'active', roleCodes: ['operator'] },
  { username: 'auditor', name: '审核专员', password: 'admin123', status: 'active', roleCodes: ['auditor'] },
  { username: 'space-ops', name: '空间运营', password: 'admin123', status: 'disabled', roleCodes: ['space-ops'] },
]
