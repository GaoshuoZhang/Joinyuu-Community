import { IsIn, IsOptional, IsString } from 'class-validator'

/* POST /me/projects/:id/tasks 新任务 */
export class CreateTaskDto {
  @IsString()
  name!: string

  @IsOptional()
  @IsString()
  assignee?: string

  @IsOptional()
  @IsString()
  duedAt?: string
}

/* PUT /me/projects/:id/tasks/:taskId 更新（仅 name/assignee/status/duedAt） */
export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  assignee?: string

  @IsOptional()
  @IsIn(['todo', 'doing', 'done'])
  status?: 'todo' | 'doing' | 'done'

  @IsOptional()
  @IsString()
  duedAt?: string
}