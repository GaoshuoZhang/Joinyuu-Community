import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class CreateCommentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  content!: string

  @IsOptional()
  @IsIn(['individual', 'community_individual', 'community_enterprise', 'external_enterprise'])
  asIdentity?: 'individual' | 'community_individual' | 'community_enterprise' | 'external_enterprise'

  @IsOptional()
  @IsString()
  asEnterpriseId?: string
}
