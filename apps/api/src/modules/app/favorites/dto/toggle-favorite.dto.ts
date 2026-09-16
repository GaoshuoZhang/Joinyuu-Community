import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

/** 收藏目标类型（需求/文章/活动/企业/人才） */
const FAVORITE_TARGET_TYPES = ['demand', 'article', 'event', 'enterprise', 'talent'] as const

/* POST /me/favorites/toggle 入参（title/subtitle 为收藏时的展示快照） */
export class ToggleFavoriteDto {
  @IsIn(FAVORITE_TARGET_TYPES, { message: '收藏类型无效' })
  type!: (typeof FAVORITE_TARGET_TYPES)[number]

  @IsString()
  @IsNotEmpty({ message: '缺少收藏对象' })
  @MaxLength(16, { message: '收藏对象无效' })
  targetId!: string

  @IsString()
  @IsNotEmpty({ message: '缺少收藏标题' })
  @MaxLength(128, { message: '收藏标题过长' })
  title!: string

  @IsOptional()
  @IsString()
  @MaxLength(128, { message: '收藏副标题过长' })
  subtitle?: string
}
