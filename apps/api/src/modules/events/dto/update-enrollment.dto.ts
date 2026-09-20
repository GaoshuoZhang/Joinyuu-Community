import { IsBoolean } from 'class-validator'

/* PATCH /api/admin/events/:id/enrollment — 显式设置报名开关（幂等，重放不会翻转） */
export class UpdateEnrollmentDto {
  @IsBoolean({ message: 'enrollmentOpen 必须是布尔值' })
  enrollmentOpen!: boolean
}
