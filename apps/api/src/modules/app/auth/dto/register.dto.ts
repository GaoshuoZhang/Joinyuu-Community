import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator'

/** 移动端注册（认证 + 默认 individual 身份 + 协议同意留痕） */
export class RegisterDto {
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  phone!: string

  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/, { message: '密码至少 8 位且包含字母与数字' })
  password!: string

  @IsString()
  @IsNotEmpty({ message: '请输入昵称' })
  nickname!: string

  @IsString()
  captchaId!: string

  @IsString()
  captchaCode!: string

  /** 须勾选同意用户协议与隐私政策 */
  @IsBoolean({ message: '请先阅读并同意用户协议与隐私政策' })
  agreed!: boolean

  @IsOptional()
  @IsIn(['male', 'female', 'unknown'])
  gender?: string

  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  email?: string
}
