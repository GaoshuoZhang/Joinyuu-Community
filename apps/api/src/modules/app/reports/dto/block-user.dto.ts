import { IsNotEmpty } from 'class-validator'

/** 屏蔽用户（目标 uid；幂等） */
export class BlockUserDto {
  @IsNotEmpty({ message: '请指定要屏蔽的用户' })
  uid!: string
}
