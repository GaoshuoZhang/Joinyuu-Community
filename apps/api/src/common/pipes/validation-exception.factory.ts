import { BadRequestException, type ValidationError } from '@nestjs/common'

/* 参数校验错误 → 中文文案（D-003 修复）：
 * ValidationPipe 的 exceptionFactory 使用；按“属性路径 + 约束名”翻译，min/max 从约束值中提取阈值。
 * 未覆盖的约束统一输出“参数不合法”，避免再向用户暴露英文原文。 */

function extractNumber(raw: string, pattern: RegExp): string | null {
  const matched = raw.match(pattern)
  return matched ? matched[1] : null
}

const CONSTRAINT_TEXT: Record<string, (path: string, raw: string) => string> = {
  isInt: (p) => `${p} 必须是整数`,
  isNumber: (p) => `${p} 必须是数字`,
  isString: (p) => `${p} 必须是字符串`,
  isBoolean: (p) => `${p} 必须是布尔值`,
  isArray: (p) => `${p} 必须是数组`,
  isIn: (p) => `${p} 取值不在允许范围内`,
  isEmail: (p) => `${p} 邮箱格式不正确`,
  isNotEmpty: (p) => `${p} 不能为空`,
  isDefined: (p) => `${p} 不能为空`,
  isDateString: (p) => `${p} 日期格式不正确`,
  arrayMinSize: (p) => `${p} 至少需要 1 项`,
  arrayMaxSize: (p) => `${p} 项数超出上限`,
  maxLength: (p) => `${p} 长度超出上限`,
  minLength: (p) => `${p} 长度不足`,
  whitelistValidation: (p) => `${p} 不是允许的字段`,
  min: (p, raw) => {
    const value = extractNumber(raw, /less than (-?\d+)/)
    return value ? `${p} 不能小于 ${value}` : `${p} 小于允许的最小值`
  },
  max: (p, raw) => {
    const value = extractNumber(raw, /greater than (-?\d+)/)
    return value ? `${p} 不能大于 ${value}` : `${p} 超过允许的最大值`
  },
}

/* 含中文字符视为 DTO 自定义文案，原样保留；默认英文消息才做翻译 */
const CJK = /[\u4e00-\u9fff]/

function translate(error: ValidationError, parent = ''): string[] {
  const path = parent ? `${parent}.${error.property}` : error.property
  const own = Object.entries(error.constraints ?? {}).map(([name, raw]) => {
    if (CJK.test(raw)) return raw
    const render = CONSTRAINT_TEXT[name]
    return render ? render(path, raw) : `${path} 参数不合法`
  })
  const children = (error.children ?? []).flatMap((child) => translate(child, path))
  return [...own, ...children]
}

export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const messages = errors.flatMap((error) => translate(error))
  return new BadRequestException(messages.length ? messages : ['参数校验失败'])
}
