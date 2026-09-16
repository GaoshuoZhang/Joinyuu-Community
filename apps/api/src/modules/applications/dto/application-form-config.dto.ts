import { IsArray, IsNotEmpty, IsString } from 'class-validator'

export class ApplicationFormConfigDto {
  @IsString()
  @IsNotEmpty()
  title!: string

  @IsString()
  subtitle!: string

  @IsString()
  @IsNotEmpty()
  submitLabel!: string

  @IsArray()
  tips!: unknown[]

  @IsArray()
  fields!: unknown[]
}
