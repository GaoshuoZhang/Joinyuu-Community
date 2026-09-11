import { SetMetadata } from '@nestjs/common'

export const PERMISSION_KEY = 'requirePermission'

/** 声明端点所需权限码（菜单路径或 perm:xxx 按钮码）。
 * 传入数组时为「任一命中即可」（用于跨域复用的公共选项端点）。
 * 无装饰器 = 仅需登录；权限集合含 '*'（超管）或命中所需码时放行。 */
export const RequirePermission = (code: string | string[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(PERMISSION_KEY, code)
