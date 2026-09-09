import type { ExperienceRecord, ExperienceRule, LevelTier } from '@/types'
import { experienceRules, levelTiers } from '@/mock/rules'
import { experienceRecords } from '@/mock/ledgers'
import { delay } from './utils'

/* ---------- 经验值规则（触发项写死，仅可编辑经验值与启停） ---------- */

/* TODO: 替换为 GET /api/admin/rules/experience — 经验值规则列表（触发项写死，按 code 排序） */
export async function fetchExperienceRules(): Promise<ExperienceRule[]> {
  await delay(300)
  return [...experienceRules].sort((a, b) => a.code.localeCompare(b.code))
}

/* TODO: 替换为 PUT /api/admin/rules/experience/:code — 编辑经验值（触发项/名称/说明写死不可改） */
export async function updateExperienceRule(
  code: string,
  payload: { exp: number },
): Promise<{ code: number }> {
  await delay(400)
  const rule = experienceRules.find((r) => r.code === code)
  if (!rule) throw new Error('经验值规则不存在')
  if (!Number.isInteger(payload.exp) || payload.exp <= 0)
    throw new Error('经验值必须为正整数')
  rule.exp = payload.exp
  rule.updatedAt = formatNow()
  return { code: 0 }
}

/* TODO: 替换为 POST /api/admin/rules/experience/:code/toggle-status — 启用/停用规则 */
export async function toggleExperienceRuleStatus(code: string): Promise<{ code: number }> {
  await delay(350)
  const rule = experienceRules.find((r) => r.code === code)
  if (!rule) throw new Error('经验值规则不存在')
  rule.status = rule.status === 'enabled' ? 'disabled' : 'enabled'
  rule.updatedAt = formatNow()
  return { code: 0 }
}

/* TODO: 替换为 GET /api/admin/rules/experience-issuance — 经验值发放记录（仅规则自动发放，最新在前）；
 * 手动调整/扣减不属于发放记录（见用户详情经验流水） */
export async function fetchExperienceIssuanceRecords(): Promise<ExperienceRecord[]> {
  await delay(300)
  return experienceRecords
    .filter((r) => r.source === 'rule')
    .sort((a, b) => b.at.localeCompare(a.at))
}

/* ---------- 等级梯度（整组保存，最低 1 级、最多 10 级，门槛严格递增） ---------- */

/* TODO: 替换为 GET /api/admin/rules/levels — 等级梯度（level 升序） */
export async function fetchLevelTiers(): Promise<LevelTier[]> {
  await delay(300)
  return [...levelTiers].sort((a, b) => a.level - b.level)
}

/* TODO: 替换为 PUT /api/admin/rules/levels — 整组保存等级梯度（等级数/标签/门槛），
 * 保存后需重算存量社区个体/社区企业身份的等级（原型阶段不迁移历史数据） */
export async function saveLevelTiers(tiers: LevelTier[]): Promise<{ code: number }> {
  await delay(450)
  if (!Array.isArray(tiers) || tiers.length === 0) throw new Error('至少保留 1 个等级')
  if (tiers.length > 10) throw new Error('等级最多 10 级')
  if (tiers.some((t) => !t.label.trim())) throw new Error('等级标签不能为空')
  if (tiers.some((t) => !Number.isInteger(t.threshold) || t.threshold < 0))
    throw new Error('门槛经验值必须为不小于 0 的整数')
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i].threshold <= tiers[i - 1].threshold)
      throw new Error('门槛经验值必须逐级递增')
  }
  levelTiers.splice(0, levelTiers.length, ...tiers.map((t, i) => ({ ...t, level: i + 1 })))
  return { code: 0 }
}

function formatNow(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
