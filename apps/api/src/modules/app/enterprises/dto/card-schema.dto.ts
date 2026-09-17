import { IsArray, IsIn, IsString } from 'class-validator'

export const INDIVIDUAL_CARD_FIELDS = [
  'displayName', 'age', 'politicalStatus', 'intro', 'industryExperience', 'skills',
  'education', 'work', 'projects', 'honors', 'socials', 'customLinks', 'visibility',
] as const

export const ENTERPRISE_CARD_FIELDS = [
  'logo', 'industry', 'size', 'foundedAt', 'website', 'address', 'description', 'services', 'advantages',
] as const

export class SaveCardSchemaDto {
  @IsArray()
  @IsString({ each: true })
  editableFields!: string[]
}

export class CardTypeDto {
  @IsIn(['individual', 'enterprise'])
  type!: 'individual' | 'enterprise'
}
