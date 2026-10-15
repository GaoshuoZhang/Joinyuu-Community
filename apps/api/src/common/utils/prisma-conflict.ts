import { Prisma } from '@prisma/client'

/** 仅映射已知唯一字段名，不向客户端回传 SQL、冲突值或 Prisma 堆栈。 */
export function prismaConflictMessage(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return null
  const target = error.meta?.target
  const fields = Array.isArray(target) ? target.map(String) : []
  // 系统生成主键冲突属于内部故障，仍需 500 和故障日志，不能伪装成用户填错字段。
  if (fields.length === 1 && ['id', 'uid'].includes(fields[0]) || typeof target === 'string' && target.endsWith('_pkey')) return null
  const model = error.meta?.modelName
  if (model === 'User') {
    if (fields.includes('username')) return '该用户名已被使用，请更换后重试'
    if (fields.includes('nickname')) return '该昵称已被使用，请更换后重试'
    if (fields.includes('phone')) return '该联系电话已被其他用户使用'
    if (fields.includes('email')) return '该邮箱已被其他用户使用'
  }
  if (model === 'AdminUser' && fields.includes('username')) return '该管理员账号已存在'
  if (model === 'AdminRole' && fields.includes('code')) return '该角色编码已存在'
  if (model === 'WorkstationArea' && fields.includes('name')) return '该办公区域名称已存在'
  if (model === 'Workstation' && fields.includes('seatNo')) return '该办公位编号已存在'
  if (model === 'MessageTemplate' && fields.includes('code')) return '该通知模板编码已存在'
  if (model === 'MessageTemplateVersion') return '通知模板版本发生冲突，请刷新后重试'
  if (model === 'MessageChannel') return '该通知配置已存在或已被更新，请刷新后重试'
  if (model === 'DictEntry' && fields.includes('label')) return '该字典项名称已存在'
  return '记录与已有数据重复，请检查唯一字段后重试'
}
