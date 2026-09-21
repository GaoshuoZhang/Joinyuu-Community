import { IsNotEmpty, IsString } from 'class-validator'

/** 提交实名认证（姓名 + 18 位身份证号；校验码规则在服务层校验） */
export class UpdateRealnameDto {
  @IsString({ message: '请输入真实姓名' })
  @IsNotEmpty({ message: '请输入真实姓名' })
  realName!: string

  @IsString({ message: '请输入身份证号码' })
  @IsNotEmpty({ message: '请输入身份证号码' })
  citizenId!: string
}
