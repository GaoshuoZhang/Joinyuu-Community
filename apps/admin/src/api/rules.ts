import type { ExperienceRecord, ExperienceRule, LevelTier } from '@/types'
import { httpGet, httpPost, httpPut } from './http'

/* ---------- 经验值规则（触发项写死，仅可编辑经验值与启停） ---------- */

/* 已接入 M1 真实接口：GET /api/admin/rules/experience — 经验值规则列表（触发项写死，按 code 排序） */
export async function fetchExperienceRules(): Promise<ExperienceRule[]> {
  return httpGet<ExperienceRule[]>('/rules/experience')
}

/* 已接入 M1 真实接口：PUT /api/admin/rules/experience/:code — 编辑经验值（触发项/名称/说明写死不可改） */
export async function updateExperienceRule(
  code: string,
  payload: { exp: number },
): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/rules/experience/${code}`, payload)
}

/* 已接入 M1 真实接口：POST /api/admin/rules/experience/:code/toggle-status — 启用/停用规则 */
export async function toggleExperienceRuleStatus(code: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/rules/experience/${code}/toggle-status`)
}

/* 已接入 M1 真实接口：GET /api/admin/rules/experience-issuance — 经验值发放记录（仅规则自动发放，最新在前）；
 * 手动调整/扣减不属于发放记录（见用户详情经验流水） */
export async function fetchExperienceIssuanceRecords(): Promise<ExperienceRecord[]> {
  return httpGet<ExperienceRecord[]>('/rules/experience-issuance')
}

/* ---------- 等级梯度（整组保存，最低 1 级、最多 10 级，门槛严格递增） ---------- */

/* 已接入 M1 真实接口：GET /api/admin/rules/levels — 等级梯度（level 升序） */
export async function fetchLevelTiers(): Promise<LevelTier[]> {
  return httpGet<LevelTier[]>('/rules/levels')
}

/* 已接入 M1 真实接口：PUT /api/admin/rules/levels — 整组保存等级梯度 { tiers: [{ level, label, threshold }] }；
 * 保存后需重算存量社区个体/社区企业身份的等级（梯度变更仅影响后续结算） */
export async function saveLevelTiers(tiers: LevelTier[]): Promise<{ code: number }> {
  return httpPut<{ code: number }>('/rules/levels', { tiers })
}
