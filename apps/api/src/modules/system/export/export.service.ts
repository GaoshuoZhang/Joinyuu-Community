import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { AuditService } from '../../../common/audit/audit.service'
import type { QueryExportDto } from './dto/query-export.dto'

/** 单次导出行数上限：避免一次导出拉爆内存/响应体（超出部分截断，响应头 X-Export-Truncated 标注） */
const EXPORT_MAX_ROWS = 10000

interface ExportColumn {
  label: string
  value: (row: any) => string | number
}

interface ExportDef {
  fileName: string
  columns: ExportColumn[]
  fetch: (q: QueryExportDto) => Promise<any[]>
}

export interface ExportResult {
  fileName: string
  content: string
  /** 是否因超过单次导出上限被截断 */
  truncated: boolean
  /** 实际导出行数 */
  rowCount: number
}

/* 服务端导出：按域输出 CSV（UTF-8 BOM，Excel 直开不乱码）。
 * 域：users / demands / projects / events / orders / audit-logs；支持 keyword/status/时间范围过滤。
 * 导出为敏感数据批量外带出口：每次导出写操作审计，并对单次行数设上限。 */
@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async exportCsv(domain: string, q: QueryExportDto, operator: string): Promise<ExportResult> {
    const def = this.defs()[domain]
    if (!def) throw new NotFoundException('不支持的导出域')
    const rows = await def.fetch(q)
    const truncated = rows.length > EXPORT_MAX_ROWS
    const limited = truncated ? rows.slice(0, EXPORT_MAX_ROWS) : rows
    const header = def.columns.map((c) => c.label)
    const body = limited.map((r) => def.columns.map((c) => c.value(r)))
    const csv = [header, ...body].map((r) => r.map(escapeCsv).join(',')).join('\r\n')
    await this.audit.record({
      module: '系统管理',
      action: '导出数据',
      target: `${def.fileName}（${domain}）`,
      detail: `导出 ${limited.length} 行${truncated ? `（已达单次上限 ${EXPORT_MAX_ROWS}，已截断）` : ''} · 过滤：${describeQuery(q)}`,
      operator,
    })
    return { fileName: `${def.fileName}_${stamp()}.csv`, content: csv, truncated, rowCount: limited.length }
  }

  private defs(): Record<string, ExportDef> {
    const db = this.prisma
    return {
      users: {
        fileName: '社区用户',
        columns: [
          { label: 'UID', value: (r) => r.uid },
          { label: '昵称', value: (r) => r.nickname },
          { label: '姓名', value: (r) => r.realName ?? '' },
          { label: '联系电话', value: (r) => r.phone },
          { label: '邮箱', value: (r) => r.email },
          { label: '状态', value: (r) => r.status },
          { label: '注册时间', value: (r) => r.registeredAt },
        ],
        fetch: (q) =>
          db.user.findMany({
            where: {
              AND: [
                q.status ? { status: q.status } : {},
                q.keyword
                  ? {
                      OR: [
                        { nickname: { contains: q.keyword } },
                        { uid: { contains: q.keyword } },
                        { phone: { contains: q.keyword } },
                      ],
                    }
                  : {},
                q.startDate ? { registeredAt: { gte: q.startDate } } : {},
              ],
            },
            orderBy: { uid: 'asc' },
          }),
      },
      demands: {
        fileName: '需求列表',
        columns: [
          { label: '需求编号', value: (r) => r.id },
          { label: '标题', value: (r) => r.title },
          { label: '发布方', value: (r) => r.publisherName },
          { label: '分类', value: (r) => r.category },
          { label: '状态', value: (r) => r.status },
          { label: '创建时间', value: (r) => r.createdAt },
        ],
        fetch: (q) =>
          db.demand.findMany({
            where: {
              AND: [
                { deletedAt: null },
                q.status ? { status: q.status } : {},
                q.keyword ? { title: { contains: q.keyword } } : {},
              ],
            },
            orderBy: { createdAt: 'desc' },
          }),
      },
      projects: {
        fileName: '项目列表',
        columns: [
          { label: '项目编号', value: (r) => r.code },
          { label: '项目名称', value: (r) => r.name },
          { label: '状态', value: (r) => r.status },
          { label: '进度', value: (r) => r.progress },
          { label: '成员数', value: (r) => r.memberCount },
          { label: '发起时间', value: (r) => r.initiatedAt },
        ],
        fetch: (q) =>
          db.project.findMany({
            where: {
              AND: [
                { deletedAt: null },
                q.status ? { status: q.status } : {},
                q.keyword ? { name: { contains: q.keyword } } : {},
              ],
            },
            orderBy: { initiatedAt: 'desc' },
          }),
      },
      events: {
        fileName: '活动列表',
        columns: [
          { label: '活动编号', value: (r) => r.id },
          { label: '标题', value: (r) => r.title },
          { label: '类型', value: (r) => r.type },
          { label: '地点', value: (r) => r.location },
          { label: '开始时间', value: (r) => r.startTime },
          { label: '状态', value: (r) => r.status },
        ],
        fetch: (q) =>
          db.communityEvent.findMany({
            where: {
              AND: [
                { deletedAt: null },
                q.status ? { status: q.status } : {},
                q.keyword ? { title: { contains: q.keyword } } : {},
              ],
            },
            orderBy: { startTime: 'desc' },
          }),
      },
      orders: {
        fileName: '兑换订单',
        columns: [
          { label: '订单编号', value: (r) => r.id },
          { label: '用户', value: (r) => r.userName },
          { label: '商品', value: (r) => r.goodsName },
          { label: '积分', value: (r) => r.points },
          { label: '状态', value: (r) => r.status },
          { label: '下单时间', value: (r) => r.createdAt },
        ],
        fetch: (q) =>
          db.redemptionOrder.findMany({
            where: {
              AND: [
                /* 与列表页/其它导出域口径一致：软删（已归档）订单不进入导出 */
                { deletedAt: null },
                q.status ? { status: q.status } : {},
                q.keyword ? { userName: { contains: q.keyword } } : {},
              ],
            },
            orderBy: { createdAt: 'desc' },
          }),
      },
      'audit-logs': {
        fileName: '操作日志',
        columns: [
          { label: '时间', value: (r) => r.at },
          { label: '操作人', value: (r) => r.operator },
          { label: '模块', value: (r) => r.module },
          { label: '操作', value: (r) => r.action },
          { label: '对象', value: (r) => r.target },
          { label: '备注', value: (r) => r.detail ?? '' },
        ],
        fetch: (q) =>
          db.auditLog.findMany({
            where: {
              AND: [
                q.keyword
                  ? {
                      OR: [
                        { operator: { contains: q.keyword } },
                        { target: { contains: q.keyword } },
                      ],
                    }
                  : {},
                q.startDate ? { at: { gte: q.startDate } } : {},
                q.endDate ? { at: { lte: `${q.endDate} 23:59:59` } } : {},
              ],
            },
            orderBy: { at: 'desc' },
          }),
      },
    }
  }
}

function escapeCsv(v: string | number): string {
  if (typeof v === 'number') return String(v)
  let s = String(v ?? '')
  /* 防 CSV 公式注入：= + - @ 或制表符/回车开头的文本前置单引号，Excel 按文本处理 */
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function stamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

/** 导出过滤条件摘要（写入审计，便于追溯「谁在什么条件下导出了多少数据」） */
function describeQuery(q: QueryExportDto): string {
  const parts: string[] = []
  if (q.status) parts.push(`状态=${q.status}`)
  if (q.keyword) parts.push(`关键词=${q.keyword}`)
  if (q.startDate) parts.push(`起=${q.startDate}`)
  if (q.endDate) parts.push(`止=${q.endDate}`)
  return parts.length ? parts.join(' ') : '无'
}
