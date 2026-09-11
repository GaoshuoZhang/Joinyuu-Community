import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { map, Observable } from 'rxjs'

/* 统一响应包络（wiki-backend.md §4.1）：
 * 成功 → { code: 0, data: <接口返回值原样> }；错误由 HttpExceptionFilter 输出 { code, message } */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data: unknown) => ({ code: 0, data: data ?? null })))
  }
}
