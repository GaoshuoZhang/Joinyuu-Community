import { Transform } from 'class-transformer'
import {
  Allow,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

const FIELD_TYPES = ['text', 'textarea', 'select', 'number', 'date', 'upload'] as const
const FIELD_PROPERTIES = new Set([
  'key', 'label', 'type', 'required', 'placeholder', 'help', 'maxlength',
  'options', 'accept', 'multiple', 'maxCount',
])
const OPTION_PROPERTIES = new Set(['label', 'value'])

function extras(value: Record<string, unknown>, known: Set<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !known.has(key)))
}

function toOptionDto(item: unknown): ApplicationFieldOptionDto {
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {}
  return Object.assign(new ApplicationFieldOptionDto(), source, { extraProperties: extras(source, OPTION_PROPERTIES) })
}

function toFieldDto(item: unknown): ApplicationFormFieldDto {
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {}
  const field = Object.assign(new ApplicationFormFieldDto(), source, { extraProperties: extras(source, FIELD_PROPERTIES) })
  if (Array.isArray(source.options)) field.options = source.options.map(toOptionDto)
  return field
}

export class ApplicationFieldOptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  value!: string

  @Allow()
  @IsObject()
  extraProperties!: Record<string, unknown>
}

export class ApplicationFormFieldDto {
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9_]*$/)
  @MaxLength(64)
  key!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label!: string

  @IsIn(FIELD_TYPES)
  type!: (typeof FIELD_TYPES)[number]

  @IsOptional()
  @IsBoolean()
  required?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(200)
  placeholder?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  help?: string

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  maxlength?: number

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Transform(({ value }) => Array.isArray(value) ? value.map(toOptionDto) : value, { toClassOnly: true })
  options?: ApplicationFieldOptionDto[]

  @IsOptional()
  @IsString()
  @MaxLength(255)
  accept?: string

  @IsOptional()
  @IsBoolean()
  multiple?: boolean

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxCount?: number

  @Allow()
  @IsObject()
  extraProperties!: Record<string, unknown>
}

export class ApplicationFormConfigDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string

  @IsString()
  @MaxLength(200)
  subtitle!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  submitLabel!: string

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  tips!: string[]

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Transform(({ value }) => Array.isArray(value) ? value.map(toFieldDto) : value, { toClassOnly: true })
  fields!: ApplicationFormFieldDto[]
}
