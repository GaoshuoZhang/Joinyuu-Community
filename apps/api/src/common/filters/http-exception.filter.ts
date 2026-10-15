import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import type { Response } from 'express'
import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { prismaConflictMessage } from '../utils/prisma-conflict'

/* 统一错误输出：HTTP 状态码 + { code, message }，message 直接可展示（admin 视图层 catch 展示 e.message）
 * HttpException → 提取 message（BadRequestException 的校验数组以"；"拼接）
 * Prisma P2002 唯一字段冲突 → 可读的 409（系统主键冲突仍保留为故障）
 * 未捕获异常 → 500 服务器内部错误（原始错误仅打日志）
 * 5xx 统一追加落盘 .logs/api-error.log（.logs/ 已 gitignore），便于事后排查偶发故障 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let message = '服务器内部错误'
    const conflict = prismaConflictMessage(exception)

    if (conflict) {
      // 唯一约束是可恢复的请求冲突，不记录为“未捕获异常”或 5xx 故障。
      status = HttpStatus.CONFLICT
      message = conflict
    } else if (exception instanceof HttpException) {
      status = exception.getStatus()
      const payload = exception.getResponse()
      if (typeof payload === 'string') {
        message = payload
      } else if (payload !== null && typeof payload === 'object' && 'message' in payload) {
        const raw = (payload as { message: string | string[] }).message
        message = Array.isArray(raw) ? raw.join('；') : String(raw)
      }
      /* Nest FileInterceptor 超限抛 PayloadTooLargeException('File too large')：转为可展示中文提示 */
      if (status === HttpStatus.PAYLOAD_TOO_LARGE || message === 'File too large') {
        status = HttpStatus.BAD_REQUEST
        message = '文件过大，请压缩后重试（可在「系统配置」调整上传文件大小限制）'
      }
      /* body-parser JSON 解析失败：不同 Nest 版本可能包装为 BadRequestException 透出英文原文 */
      const parseType = (exception as { type?: string }).type
      if (
        status === HttpStatus.BAD_REQUEST &&
        (parseType === 'entity.parse.failed' || /JSON at position|Unexpected token|Expected property name/i.test(message))
      ) {
        message = '请求体格式错误，请检查 JSON 内容'
      }
    } else if (exception instanceof Error) {
      const type = (exception as { type?: string }).type
      /* body-parser JSON 解析失败（entity.parse.failed）：转可展示中文提示 */
      if (type === 'entity.parse.failed') {
        status = HttpStatus.BAD_REQUEST
        message = '请求体格式错误，请检查 JSON 内容'
      } else {
        /* Prisma 无法连接数据库（Pg 容器/网络瞬断）：给用户可读的 503 而不是 500，并落盘便于排查 */
        const prismaCode = (exception as { code?: string }).code
        if (prismaCode === 'P1001' || prismaCode === 'P1002') {
          status = HttpStatus.SERVICE_UNAVAILABLE
          message = '数据库连接暂时不可用，请稍后重试'
        }
        console.error('[api] 未捕获异常:', exception)
      }
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? (exception.stack ?? exception.message) : String(exception)
      this.persistError(status, message, stack)
    }

    response.status(status).json({ code: status, message })
  }

  private persistError(status: number, message: string, stack: string): void {
    const line = `[${new Date().toISOString()}] ${status} ${message}\n${stack}\n\n`
    const dir = join(process.cwd(), '.logs')
    void mkdir(dir, { recursive: true })
      .then(() => appendFile(join(dir, 'api-error.log'), line, 'utf8'))
      .catch(() => undefined)
  }
}
