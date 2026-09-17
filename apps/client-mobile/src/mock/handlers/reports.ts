import type { ReportPayload } from '@/types'
import { nextMockId, nowStamp, pushNotice, reports, trackMockEvent } from '@/mock/db'
import { readPayload } from '@/mock/session'
import { fail, withLatency } from '@/mock/latency'

/* [MOCK-ONLY] v35 举报：记录到 Mock 运营队列（DevTools 可见），接入期接管理端举报处理与内容处置。 */

export async function submitReport(payload: ReportPayload): Promise<void> {
  await withLatency(() => {
    const uid = readPayload()?.sub
    if (!uid) fail(401, '请先登录后再举报')
    if (!payload.reason.trim()) fail(400, '请选择举报原因')
    reports.unshift({
      id: nextMockId('RP'),
      uid,
      at: nowStamp(),
      status: 'pending',
      ...payload,
      reason: payload.reason.trim(),
      detail: payload.detail?.trim() || undefined,
    })
    pushNotice(uid, {
      type: 'system',
      title: '举报已收到',
      content: `我们已收到你对「${payload.targetTitle}」的举报，运营将在核实后处理。`,
    })
    trackMockEvent('report_submit')
  }, 160)
}
