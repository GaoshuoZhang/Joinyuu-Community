/**
 * 内置 V1.0 协议（正式部署兜底）
 *
 * 正式部署通常只执行迁移、不导入开发种子；若数据库中没有 published 的
 * `agreement_user` / `agreement_privacy`（Policy 表），注册与协议页会失败：
 * - `POST /api/app/auth/register` 抛「用户协议或隐私政策尚未发布」
 * - `GET /api/app/policies/:kind` 404，注册页无法核对协议版本
 *
 * 本模块提供与数据库无关的内置 V1.0 协议：
 * 1）接口按最新 published 优先，缺失时返回内置版本（`builtIn: true`）；
 * 2）注册同意留痕使用同一版本号，保证 AgreementConsent.version 可追溯。
 *
 * 注意：内容需与迁移 `20260920180000_builtin_agreement_v1` 中的内置协议保持一致；
 * 后台发布新版本后自动以数据库版本覆盖，内置版本仅作兜底。
 */

export const BUILTIN_AGREEMENT_VERSION = '1.0'
export const BUILTIN_AGREEMENT_EFFECTIVE_AT = '2026-01-01'
export const BUILTIN_AGREEMENT_PUBLISHED_AT = '2026-01-01 00:00'
export const BUILTIN_AGREEMENT_PUBLISHER = '聚屿社区'

export interface BuiltinAgreement {
  /** 对外路径 kind（/api/app/policies/:kind 与 AgreementConsent.agreementType 口径一致） */
  kind: 'user_agreement' | 'privacy_policy'
  /** Policy.kind（数据库内部口径） */
  policyKind: 'agreement_user' | 'agreement_privacy'
  title: string
  summary: string
  content: string
}

export const BUILTIN_AGREEMENTS: Record<BuiltinAgreement['kind'], BuiltinAgreement> = {
  user_agreement: {
    kind: 'user_agreement',
    policyKind: 'agreement_user',
    title: '聚屿社区用户协议',
    summary: '社区用户权利义务与行为规范',
    content: [
      '<h2>一、总则</h2>',
      '<p>欢迎使用聚屿社区（以下称“本平台”）。本协议是您与本平台就账号注册、身份管理、内容发布、需求对接、活动报名、积分商城与空间预约等服务所订立的协议。请您在注册前仔细阅读并充分理解本协议，勾选同意即视为接受全部条款。</p>',
      '<h2>二、账号注册与安全</h2>',
      '<p>您应使用真实、有效的手机号注册账号，并妥善保管账号与密码。因您保管不善造成的损失由您自行承担；发现账号被他人非法使用时，请及时联系社区运营。</p>',
      '<h2>三、用户行为规范</h2>',
      '<p>您承诺遵守法律法规与社区公序良俗，不得发布违法违规、虚假、侵权或骚扰性内容，不得从事刷量、恶意注册、攻击平台等行为。</p>',
      '<h2>四、内容与知识产权</h2>',
      '<p>您发布的内容应确保拥有相应权利；发布后本平台可在社区范围内展示与分发。平台提供的界面、文档与标识等知识产权归本平台或权利人所有。</p>',
      '<h2>五、积分、商城与活动</h2>',
      '<p>积分、权益券与活动权益按平台规则发放与使用，不可转让或兑换现金；具体规则以各业务页面说明为准。</p>',
      '<h2>六、服务变更与终止</h2>',
      '<p>本平台可能因运营需要调整服务内容。若您违反本协议，平台有权视情节采取内容下架、限制功能、冻结或注销账号等措施。</p>',
      '<h2>七、免责声明</h2>',
      '<p>因不可抗力、网络故障或第三方原因导致服务中断或数据丢失的，本平台在法律允许范围内不承担责任。</p>',
      '<h2>八、其他</h2>',
      '<p>本协议的解释与争议解决适用中华人民共和国法律。本协议更新后将在本页面公布，继续使用服务即视为接受更新后的协议。</p>',
    ].join(''),
  },
  privacy_policy: {
    kind: 'privacy_policy',
    policyKind: 'agreement_privacy',
    title: '聚屿社区隐私政策',
    summary: '个人信息收集、使用与保护说明',
    content: [
      '<h2>一、我们收集的信息</h2>',
      '<p>为提供社区服务，我们可能收集：账号信息（手机号、昵称、头像）、实名信息（真实姓名、证件号码）、名片与简历内容、企业与空间使用信息、活动报名与积分商城交易记录。</p>',
      '<h2>二、信息的使用</h2>',
      '<p>收集的信息用于账号与会话管理、身份审核与展示、需求与项目撮合、活动报名与签到、积分商城履约、通知提醒及安全风控。</p>',
      '<h2>三、信息的存储与保护</h2>',
      '<p>我们采取加密传输、访问控制与最小授权等措施保护您的信息，并仅在实现服务目的所需的期限内保留。</p>',
      '<h2>四、信息共享与披露</h2>',
      '<p>未经您的同意，我们不会向第三方共享可识别个人身份的信息；法律法规另有规定或为保护公共利益的除外。</p>',
      '<h2>五、您的权利</h2>',
      '<p>您可在“我的”页面查询、更正个人资料与名片信息，管理隐私可见范围，申请注销账号或撤回授权。</p>',
      '<h2>六、未成年人保护</h2>',
      '<p>若您为未成年人，请在监护人陪同下阅读本政策并使用本平台服务。</p>',
      '<h2>七、政策更新</h2>',
      '<p>本政策更新后将在本页面公布最新版本与生效时间；重大变更将以站内信等方式提示。</p>',
      '<h2>八、联系我们</h2>',
      '<p>如对本政策有疑问或投诉，可通过社区运营联系方式与我们沟通，我们将在 15 个工作日内处理。</p>',
    ].join(''),
  },
}

/** 按对外路径 kind 取内置协议（未知 kind 返回 undefined，接口保持 404） */
export function builtinAgreementByPath(kind: string): BuiltinAgreement | undefined {
  return (BUILTIN_AGREEMENTS as Record<string, BuiltinAgreement>)[kind]
}
