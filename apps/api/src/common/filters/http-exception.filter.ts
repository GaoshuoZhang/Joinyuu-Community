import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import type { Response } from 'express'

/* 统一错误输出：HTTP 状态码 + { code, message }，message 直接可展示（admin 视图层 catch 展示 e.message）
 * HttpException → 提取 message（BadRequestException 的校验数组以"；"拼接）
 * 未捕获异常 → 500 服务器内部错误（原始错误仅打日志） */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let message = '服务器内部错误'

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const payload = exception.getResponse()
      if (typeof payload === 'string') {
        message = payload
      } else if (payload !== null && typeof payload === 'object' && 'message' in payload) {
        const raw = (payload as { message: string | string[] }).message
        message = Array.isArray(raw) ? raw.join('；') : String(raw)
      }
    } else if (exception instanceof Error) {
      console.error('[api] 未捕获异常:', exception)
    }

    response.status(status).json({ code: status, message })
  }
}
