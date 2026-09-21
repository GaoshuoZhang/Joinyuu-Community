import { BadRequestException } from '@nestjs/common'
import { formatNow } from './time'

/* 定时发布时间统一校验与规范化（管理端需求/活动/资讯的 schedule 入口共用）。
 * 背景：scheduledAt 为 VARCHAR(16) 的分钟精度本地时间字符串，调度任务按字符串 lte 比较，
 * 非法取值（如 '0'）会被判为「已到点」而立即发布，超长取值会溢出列宽报 500。
 * 因此写入前必须：格式合法 + 归一为 YYYY-MM-DD HH:mm + 晚于当前时间。 */

const SCHEDULE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/

/** 校验并规范化定时发布时间；非法或早于当前时间抛 400，返回 YYYY-MM-DD HH:mm */
export function normalizeScheduledAt(raw: string | undefined | null, label = '定时发布时间'): string {
  const value = (raw ?? '').trim()
  const matched = SCHEDULE_RE.exec(value)
  if (!matched) throw new BadRequestException(`${label}格式不正确，应为 YYYY-MM-DD HH:mm`)
  const [, year, month, day, hour = '00', minute = '00'] = matched
  const normalized = `${year}-${month}-${day} ${hour}:${minute}`
  if (normalized <= formatNow()) throw new BadRequestException(`${label}需晚于当前时间`)
  return normalized
}