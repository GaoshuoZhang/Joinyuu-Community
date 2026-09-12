import { IsString, Matches, MinLength } from 'class-validator'

export class ResetUserPasswordDto {
  @IsString({ message: '密码格式不正确' })
  @MinLength(8, { message: '密码至少 8 位' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: '密码需同时包含字母和数字' })
  password!: string
}
