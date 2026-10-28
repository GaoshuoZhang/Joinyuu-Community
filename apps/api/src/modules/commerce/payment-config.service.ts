import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { createCipheriv, createDecipheriv, randomBytes, X509Certificate } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { formatNow } from '../../common/utils/time'
import { environmentWechatSettings, inspectWechatSettings, normalizeWechatSettings, WechatSettings } from './wechat-config'
import { SavePaymentConfigDto } from './payment-config.dto'

/** Secrets are encrypted outside public asset storage; the master key never enters the DB. */
@Injectable()
export class PaymentConfigService {
  constructor(private readonly db: PrismaService, private readonly ids: IdGeneratorService) {}

  private encryptionKey(create: boolean) {
    const configured = process.env.PAYMENT_CONFIG_ENCRYPTION_KEY
    if (configured) {
      if (!/^[0-9a-fA-F]{64}$/.test(configured)) throw new ServiceUnavailableException('支付配置加密主密钥须为64位十六进制')
      return Buffer.from(configured, 'hex')
    }
    const path = resolve(process.env.PAYMENT_CONFIG_KEY_FILE ?? '.private/wechatpay-config.key')
    if (create) {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
      try { writeFileSync(path, randomBytes(32), { flag: 'wx', mode: 0o600 }) }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw new ServiceUnavailableException('支付配置加密主密钥无法创建，请检查私有目录权限') }
    }
    try { const key = readFileSync(path); if (key.length !== 32) throw new Error(); return key }
    catch { throw new ServiceUnavailableException('支付配置加密主密钥不可用，请恢复私有目录中的原密钥') }
  }

  private seal(value: WechatSettings) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.encryptionKey(true), iv)
    cipher.setAAD(Buffer.from('joinyuu/wechat-config/v1'))
    const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
  }
  private unseal(ciphertext: string): WechatSettings {
    const data = Buffer.from(ciphertext, 'base64'), decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(false), data.subarray(0, 12))
    decipher.setAAD(Buffer.from('joinyuu/wechat-config/v1')); decipher.setAuthTag(data.subarray(12, 28))
    try { return normalizeWechatSettings(JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8')) as Partial<WechatSettings>) }
    catch { throw new ServiceUnavailableException('支付配置无法解密，请恢复原加密主密钥；不要直接覆盖原配置') }
  }

  async runtime(tx: Prisma.TransactionClient = this.db) {
    const row = await tx.paymentMerchantConfig.findUnique({ where: { id: 'wechat' } })
    return row ? this.unseal(row.ciphertext) : environmentWechatSettings()
  }
  async inspect() {
    const row = await this.db.paymentMerchantConfig.findUnique({ where: { id: 'wechat' } })
    const value = row ? this.unseal(row.ciphertext) : environmentWechatSettings()
    return { ...inspectWechatSettings(value), version: row?.version ?? 0, source: row ? 'database' : 'environment',
      values: { mchid: value.mchid, appid: value.appid, serial: value.serial, publicKeyId: value.publicKeyId, base: value.base, clientBase: value.clientBase },
      secrets: { privateKey: !!value.privateKey, publicKey: !!value.publicKey, key: !!value.key, certificate: !!value.certificate, appSecret: !!value.appSecret }, updatedBy: row?.updatedBy, updatedAt: row?.updatedAt }
  }

  async save(dto: SavePaymentConfigDto, actor: string) {
    try {
      await this.db.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('wechatpay-config'))`
        const row = await tx.paymentMerchantConfig.findUnique({ where: { id: 'wechat' } })
        if ((row?.version ?? 0) !== dto.version) throw new ConflictException('收款配置已被其他管理员修改，请重新加载后核对')
        const before = row ? this.unseal(row.ciphertext) : environmentWechatSettings()
        const value: WechatSettings = { enabled: dto.enabled, mchid: dto.mchid.trim(), appid: dto.appid.trim(), serial: dto.serial.trim(), publicKeyId: dto.publicKeyId.trim(), base: dto.base.trim().replace(/\/$/, ''),
          key: dto.key?.trim() || before.key, privateKey: dto.privateKey?.trim() || before.privateKey, publicKey: dto.publicKey?.trim() || before.publicKey, certificate: dto.certificate?.trim() || before.certificate,
          appSecret: dto.appSecret?.trim() || before.appSecret, clientBase: (dto.clientBase?.trim() || before.clientBase).replace(/\/$/, '') }
        if (dto.certificate?.trim() && !value.serial) { try { value.serial = new X509Certificate(value.certificate).serialNumber } catch { throw new BadRequestException('商户 API 证书无效') } }
        if (value.clientBase && !/^https:\/\/[^/?#\s]+$/i.test(value.clientBase)) throw new BadRequestException('客户端站点地址须为 HTTPS 源站（不带路径或参数）')
        const check = inspectWechatSettings(value)
        if (check.certificateError) throw new BadRequestException(check.certificateError)
        if (check.fields.some(f => f.state === 'invalid')) throw new BadRequestException('配置格式或 PEM 文件无效，请按字段提示修正')
        if (value.appSecret && !/^[A-Za-z0-9]{16,64}$/.test(value.appSecret)) throw new BadRequestException('公众号 AppSecret 格式无效')
        if (value.enabled && !check.ready) throw new BadRequestException('启用微信收款前须填写全部必需参数')
        /* 逐字段比较（忽略顺序）：新增 JSAPI 字段后 JSON.stringify 的键序会因规范化而变化，
         * 不能再用字符串比较判断“仅关闭开关”。 */
        const changed = (Object.keys(value) as Array<keyof WechatSettings>)
          .some((key) => key !== 'enabled' && before[key] !== value[key])
        if (changed) {
          const pending = await tx.commercePayment.count({ where: { status: { in: ['pending', 'attention'] } } })
          const refunds = await tx.commerceRefund.count({ where: { status: { in: ['pending', 'processing', 'abnormal', 'attention'] } } })
          if (pending || refunds) throw new ConflictException('有待确认支付或退款，请先处理存量交易；目前可单独关闭收款开关')
          if ((value.mchid !== before.mchid || value.appid !== before.appid) && await tx.commercePayment.count()) throw new ConflictException('已有支付历史，暂不支持更换收款商户或 AppID')
        }
        const ciphertext = this.seal(value)
        if (row) await tx.paymentMerchantConfig.update({ where: { id: 'wechat' }, data: { ciphertext, version: { increment: 1 }, updatedBy: actor } })
        else await tx.paymentMerchantConfig.create({ data: { id: 'wechat', ciphertext, updatedBy: actor } })
        await tx.auditLog.create({ data: { id: await this.ids.next('AL', tx), module: '系统配置', action: '保存微信收款配置', target: 'wechat', operator: actor, at: formatNow(), detail: `发起收款：${value.enabled ? '启用' : '关闭'}；配置版本：${dto.version + 1}；凭据内容不记入审计` } })
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('配置已变更，请重新加载')
      throw e
    }
    return this.inspect()
  }
}
