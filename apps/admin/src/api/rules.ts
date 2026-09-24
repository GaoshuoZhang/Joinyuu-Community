import type {
  ExperienceRecord,
  ExperienceRule,
  LevelTier,
  LevelTierScope,
  PublishLimitRule,
  ScopedLevelTiers,
} from '@/types'
import { httpGet, httpPost, httpPut } from './http'

/* ---------- 经验值规则（触发项写死，仅可编辑经验值与启停） ---------- */

/* GET /api/admin/rules/experience — 经验值规则列表（触发项写死，按 code 排序） */
export async function fetchExperienceRules(): Promise<ExperienceRule[]> {
  return httpGet<ExperienceRule[]>('/rules/experience')
}

/* PUT /api/admin/rules/experience/:code — 编辑经验值（触发项/名称/说明写死不可改） */
export async function updateExperienceRule(
  code: string,
  payload: { exp: number },
): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/rules/experience/${code}`, payload)
}

/* POST /api/admin/rules/experience/:code/toggle-status — 启用/停用规则 */
export async function toggleExperienceRuleStatus(code: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/rules/experience/${code}/toggle-status`)
}

/* GET /api/admin/rules/experience-issuance — 经验值发放记录（仅规则自动发放，最新在前）；
 * 手动调整/扣减不属于发放记录（见用户详情经验值流水） */
export async function fetchExperienceIssuanceRecords(): Promise<ExperienceRecord[]> {
  return httpGet<ExperienceRecord[]>('/rules/experience-issuance')
}

/* ---------- 等级梯度（整组保存，最低 1 级、最多 10 级，门槛严格递增） ---------- */

/* GET /api/admin/rules/levels — 等级梯度（level 升序）+ 该等级每日需求发布/文章投稿额度 + 积分消费折扣 */
export async function fetchLevelTiers(scope: LevelTierScope): Promise<ScopedLevelTiers> {
  const tiers = await httpGet<LevelTier[]>(`/rules/levels?identityType=${scope}`)
  return { scope, tiers }
}

/* PUT /api/admin/rules/levels — 整组保存等级梯度
 * { identityType, tiers: [{ level, label, threshold, pointsDiscount, demandPublishLimit, articleSubmitLimit }] }；
 * 保存后需重算存量社区个体/社区企业身份的等级（梯度变更仅影响后续结算），发布额度与折扣随同事务写入 */
export async function saveLevelTiers(scope: LevelTierScope, tiers: LevelTier[]): Promise<{ code: number }> {
  return httpPut<{ code: number }>('/rules/levels', { identityType: scope, tiers })
}

/* ---------- 发布限制（个人用户固定身份组；社区身份额度按等级在等级规则页维护） ---------- */

/* GET /api/admin/rules/publishing-limits?scope=personal — 个人用户（未实名/已实名）两行 */
export async function fetchPublishLimits(): Promise<PublishLimitRule[]> {
  return httpGet<PublishLimitRule[]>('/rules/publishing-limits?scope=personal')
}

export async function savePublishLimits(rules: PublishLimitRule[]): Promise<{ code: number }> {
  return httpPut<{ code: number }>('/rules/publishing-limits', { rules })
}
