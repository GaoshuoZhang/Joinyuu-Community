import { IsInt, IsString, Min } from 'class-validator'

/* POST /me/projects/:id/files 文件元数据（storeKey 为 /api/app/uploads 返回的 key） */
export class AddFileDto {
  @IsString()
  storeKey!: string

  @IsString()
  name!: string

  @IsInt()
  @Min(0)
  size!: number
}