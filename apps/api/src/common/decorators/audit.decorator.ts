import { SetMetadata } from '@nestjs/common'

export const AUDIT_KEY = 'audit:meta'

export interface AuditMeta {
  module: string
  action: string
  /** 操作对象（编号 · 名称）；动态对象需在 Service 内调用 AuditService.record */
  target?: string
  detail?: string
}

/** 声明式审计埋点：非 GET 请求成功后由 AuditInterceptor 记录（operator/ip 取请求上下文） */
export const Audit = (meta: AuditMeta): ReturnType<typeof SetMetadata> => SetMetadata(AUDIT_KEY, meta)
