import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

/** 企业名片可编辑字段（负责人天然持有 edit_card；services/advantages 兼容字符串或数组入参，入库统一拆分为 string[]） */
export class UpdateEnterpriseDto {
  @IsOptional()
  @IsString()
  @MaxLength(64, { message: '所属行业过长' })
  industry?: string

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '企业规模过长' })
  size?: string

  @IsOptional()
  @IsString()
  description?: string

  /** 企业 Logo（上传返回的 url；空串=清空） */
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Logo 地址过长' })
  logo?: string

  @IsOptional()
  @IsString()
  @MaxLength(16, { message: '成立时间格式过长' })
  foundedAt?: string

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '官网地址过长' })
  website?: string

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: '办公地点过长' })
  address?: string

  @IsOptional()
  services?: string | string[]

  @IsOptional()
  advantages?: string | string[]
}

/** 邀请企业成员入参（phone 需已注册聚屿账号） */
export class InviteMemberDto {
  @IsString()
  @MaxLength(64, { message: '成员姓名过长' })
  name!: string

  @IsString()
  @MaxLength(32, { message: '手机号过长' })
  phone!: string

  @IsString()
  @MaxLength(64, { message: '成员职位过长' })
  role!: string
}

/** 修改企业成员信息：职位/手机号（需 manage_members）与权限（需 assign_permission） */
export class UpdateMemberDto {
  @IsOptional()
  @IsString()
  memberUid?: string

  @IsString()
  @MaxLength(64, { message: '成员姓名过长' })
  memberName!: string

  @IsOptional()
  @IsString()
  @MaxLength(64, { message: '成员职位过长' })
  role?: string

  /** 不传表示不修改；空串表示清空手机号 */
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: '手机号过长' })
  phone?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[]
}

/** 移除企业成员入参（负责人需先完成转移） */
export class RemoveMemberDto {
  @IsOptional()
  @IsString()
  memberUid?: string

  @IsString()
  @MaxLength(64, { message: '成员姓名过长' })
  memberName!: string
}

/** 发起负责人转移入参（仅负责人） */
export class TransferContactDto {
  @IsOptional()
  @IsString()
  memberUid?: string

  @IsString()
  @MaxLength(64, { message: '成员姓名过长' })
  memberName!: string
}

/** 邀请 / 负责人转移的响应动作 */
export class RespondActionDto {
  @IsIn(['accept', 'reject'])
  action!: 'accept' | 'reject'
}

/** 退驻申请入参（仅负责人） */
export class ExitApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '退驻原因过长' })
  reason?: string
}
