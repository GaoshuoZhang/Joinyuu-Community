import { Matches } from 'class-validator'

/** 绑定/更换绑定手机号：须验证新手机号（短信验证码） */
export class ChangePhoneDto {
  @Matches(/^1\d{10}$/, { message: '手机号格式不正确' })
  newPhone!: string

  /** 短信验证码（用途 change_phone） */
  @Matches(/^\d{6}$/, { message: '验证码格式不正确' })
  smsCode!: string
}
