import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { LicenseService } from './license.service'

const LICENSE_MAINTENANCE = 'license:maintenance'
/** Explicit, handler-only exceptions. Does not bypass authentication or RBAC. */
export const LicenseMaintenance = () => SetMetadata(LICENSE_MAINTENANCE, true)

@Injectable()
export class LicenseGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly license: LicenseService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ method: string }>()
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true
    if (this.reflector.get<boolean>(LICENSE_MAINTENANCE, context.getHandler())) return true
    await this.license.assertWritable()
    return true
  }
}
