import type { ExperienceRule } from '@/types'

/* ---------- 规则管理：经验值规则（触发项写死） ---------- */

/* 经验值规则触发项写死（code 为后端关联标识）：仅可编辑经验值与启停，不允许新增/删除。
 * 经验值仅社区个体/社区企业身份累积；扣除经验值不设自动规则，走管理员手动调整 */
export const experienceRules: ExperienceRule[] = [
  {
    code: 'activity_checkin',
    name: '活动签到',
    scene: '社区活动签到成功',
    exp: 5,
    status: 'enabled',
    description: '活动开始后到场签到即发放，重复签到不叠加。',
    updatedAt: '2026-08-01 10:00',
  },
  {
    code: 'activity_enroll_approved',
    name: '活动报名通过',
    scene: '报名审核通过',
    exp: 2,
    status: 'enabled',
    description: '报名审核通过后发放。',
    updatedAt: '2026-08-01 10:00',
  },
  {
    code: 'article_accepted',
    name: '投稿采纳',
    scene: '投稿审核通过并发布',
    exp: 20,
    status: 'enabled',
    description: '用户投稿经审核通过并发布后，向投稿方发放。',
    updatedAt: '2026-09-11 10:00',
  },
  {
    code: 'project_undertaken',
    name: '项目承接',
    scene: '项目立项并承接',
    exp: 30,
    status: 'enabled',
    description: '项目立项后向承接方发放。',
    updatedAt: '2026-08-01 10:00',
  },
  {
    code: 'project_completed',
    name: '项目结项',
    scene: '项目结项并验收',
    exp: 100,
    status: 'enabled',
    description: '项目结项时按承接占比向各承接方分配（仅社区企业/持社区个体身份的用户参与）。',
    updatedAt: '2026-09-09 12:00',
  },
  {
    code: 'identity_first_bind',
    name: '首次绑定社区身份',
    scene: '首次绑定社区个体/社区企业身份',
    exp: 10,
    status: 'enabled',
    description: '每个用户仅首次获得，重复绑定不叠加。',
    updatedAt: '2026-08-01 10:00',
  },
]

/* ---------- 规则管理：等级梯度 ---------- */

/* 等级梯度（默认 5 级）：门槛为累计经验值，整组保存；最低 1 级，最多 10 级 */
export const levelTiers = [
  { identityType: 'community_individual', level: 1, label: '新芽', threshold: 0 },
  { identityType: 'community_individual', level: 2, label: '成长', threshold: 100 },
  { identityType: 'community_individual', level: 3, label: '骨干', threshold: 300 },
  { identityType: 'community_individual', level: 4, label: '先锋', threshold: 600 },
  { identityType: 'community_individual', level: 5, label: '领航', threshold: 1000 },
  { identityType: 'community_enterprise', level: 1, label: '初创', threshold: 0 },
  { identityType: 'community_enterprise', level: 2, label: '成长', threshold: 300 },
  { identityType: 'community_enterprise', level: 3, label: '进阶', threshold: 1000 },
  { identityType: 'community_enterprise', level: 4, label: '标杆', threshold: 3000 },
  { identityType: 'community_enterprise', level: 5, label: '领军', threshold: 8000 },
]
