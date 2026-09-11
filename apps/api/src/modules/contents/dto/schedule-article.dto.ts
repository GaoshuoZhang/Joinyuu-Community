import { IsNotEmpty, IsString } from 'class-validator'

/* POST /api/admin/contents/articles/:id/schedule 入参 { scheduledAt }（'YYYY-MM-DD HH:mm'，与前端 valueType 及扫描比较精度一致） */
export class ScheduleArticleDto {
  @IsString()
  @IsNotEmpty()
  scheduledAt!: string
}
