import type { ExperienceRule, LevelTier } from '@/types'

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
export const levelTiers: LevelTier[] = [
  { level: 1, label: '青铜', threshold: 0 },
  { level: 2, label: '白银', threshold: 100 },
  { level: 3, label: '黄金', threshold: 300 },
  { level: 4, label: '铂金', threshold: 600 },
  { level: 5, label: '钻石', threshold: 1000 },
]
