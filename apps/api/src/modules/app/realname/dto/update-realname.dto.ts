import { IsNotEmpty } from 'class-validator'

/** 提交实名认证（姓名 + 18 位身份证号；校验码规则在服务层校验） */
export class UpdateRealnameDto {
  @IsNotEmpty({ message: '请输入真实姓名' })
  realName!: string

  @IsNotEmpty({ message: '请输入身份证号码' })
  citizenId!: string
}
