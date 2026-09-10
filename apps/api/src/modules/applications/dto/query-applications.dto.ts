import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Min } from 'class-validator'

export class QueryApplicationsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page!: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize!: number

  @IsOptional()
  @IsIn(['settle', 'identity'])
  type?: 'settle' | 'identity'

  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected'
}
