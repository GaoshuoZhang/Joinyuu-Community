import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

export class SavePolicyDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  category?: string

  @IsString()
  @MaxLength(128)
  title!: string

  @IsOptional()
  @IsString()
  @MaxLength(255)
  summary?: string

  @IsString()
  content!: string

  @IsString()
  @MaxLength(32)
  version!: string

  @IsOptional()
  @IsString()
  effectiveAt?: string

  @IsOptional()
  @IsIn(['published', 'archived'])
  status?: 'published' | 'archived'
}

export class SaveCommunityPolicyDto extends SavePolicyDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  attachments?: Array<{ name: string; url: string }>

  @IsOptional()
  @IsBoolean()
  featured?: boolean
}

export class SaveAgreementPolicyDto extends SavePolicyDto {
  @IsIn(['agreement_user', 'agreement_privacy'])
  kind!: 'agreement_user' | 'agreement_privacy'
}
