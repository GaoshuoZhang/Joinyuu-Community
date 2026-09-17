import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { TakedownDto } from '../../../common/dto/takedown.dto'

export class ReviewReportDto extends TakedownDto {
  @IsIn(['resolved', 'rejected'])
  status!: 'resolved' | 'rejected'

  @IsString()
  @MaxLength(255)
  resolution!: string

  @IsOptional()
  @IsIn(['none', 'hide', 'restore'])
  action?: 'none' | 'hide' | 'restore'
}

export class ReviewAppealDto {
  @IsIn(['accepted', 'rejected'])
  decision!: 'accepted' | 'rejected'

  @IsString()
  @MaxLength(255)
  resolution!: string
}

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
