<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Button, Cell, CellGroup, Icon, Tag } from 'tdesign-mobile-vue'
import IdentityTag from '@/components/shared/IdentityTag.vue'
import type { IdentityType } from '@/types'

/* 身份说明：四种关联身份的获取方式、限制与权益（入口在「关联身份」页底部）。
 * 说明口径（与权限实现一致）：同一账号可叠加多重身份，权益逐身份累加；
 * 等级与经验值仅对社区个体 / 社区企业生效；「专属」类权益指仅面向该身份开放的需求 / 活动 / 空间。
 *
 * 权益标签按「权益类别」着色，颜色取 TDesign Tag light 变体的语义主题槽
 * （primary=需求撮合 / success=成长与积分 / warning=名片与团队 / danger=活动与空间 / default=内容投稿）：
 * 同一类别在四张身份卡里同色，横向对比「进阶身份各多解锁了什么」时一眼可辨；
 * 类别名另有文字标题（不只靠颜色传达含义）。 */
const router = useRouter()

/** 权益类别：配色与文案集中在此，不散落在模板里 */
type BenefitCategory = 'demand' | 'growth' | 'profile' | 'access' | 'content'
type BenefitTheme = 'default' | 'primary' | 'warning' | 'danger' | 'success'

const BENEFIT_CATEGORIES: Record<BenefitCategory, { label: string; theme: BenefitTheme }> = {
  demand: { label: '需求撮合', theme: 'primary' },
  growth: { label: '成长与积分', theme: 'success' },
  profile: { label: '名片与团队', theme: 'warning' },
  access: { label: '活动与空间', theme: 'danger' },
  content: { label: '内容投稿', theme: 'default' },
}

/** 类别在卡片内的固定排列顺序（四张卡片一致，便于逐行对比） */
const CATEGORY_ORDER: BenefitCategory[] = ['demand', 'growth', 'profile', 'access', 'content']

interface BenefitGroup {
  key: BenefitCategory
  label: string
  theme: BenefitTheme
  items: string[]
}

interface IdentityGuideItem {
  type: IdentityType
  /** 表格「获取方式」列 */
  how: string
  /** 表格「限制」列 */
  limit: string
  /** 权益按类别分组（空类别不展示） */
  groups: BenefitGroup[]
  /** 权益总条数（卡片头部标注「+N 项新增」用） */
  benefitCount: number
  /** 进阶身份的行动入口（个人用户为默认身份，无入口） */
  cta?: { label: string; to: string }
}

/** 权益表：[权益名, 所属类别] —— 与后台权限口径一一对应 */
type BenefitRow = [string, BenefitCategory]

function guideItem(input: {
  type: IdentityType
  how: string
  limit: string
  benefits: BenefitRow[]
  cta?: { label: string; to: string }
}): IdentityGuideItem {
  const groups = CATEGORY_ORDER.map((key) => ({
    key,
    label: BENEFIT_CATEGORIES[key].label,
    theme: BENEFIT_CATEGORIES[key].theme,
    items: input.benefits.filter(([, category]) => category === key).map(([label]) => label),
  })).filter((group) => group.items.length > 0)
  return {
    type: input.type,
    how: input.how,
    limit: input.limit,
    groups,
    benefitCount: groups.reduce((total, group) => total + group.items.length, 0),
    cta: input.cta,
  }
}

/* 个人用户：注册即得的默认身份（其余身份都在此基础上叠加） */
const baseline = guideItem({
  type: 'individual',
  how: '注册账号即自动获得',
  limit: '默认身份，人手一份，不可取消',
  benefits: [
    ['发布需求', 'demand'],
    ['公开需求响应', 'demand'],
    ['积分商城兑换', 'growth'],
    ['公开活动报名', 'access'],
    ['公共空间预约', 'access'],
    ['文章投稿', 'content'],
  ],
})

const advanced: IdentityGuideItem[] = [
  guideItem({
    type: 'community_individual',
    how: '完成人才登记并通过审核',
    limit: '1 个账号 1 个社区个体身份',
    benefits: [
      ['社区个体等级体系', 'growth'],
      ['社区个体专属名片（人才库展示）', 'profile'],
      ['社区个体专属需求响应', 'demand'],
      ['社区个体专属活动', 'access'],
      ['社区个体专属空间预约', 'access'],
      ['以社区个体身份投稿', 'content'],
    ],
    cta: { label: '去人才登记', to: '/intros/talent' },
  }),
  guideItem({
    type: 'community_enterprise',
    how: '完成企业入驻并通过审核',
    limit: '1 个账号可关联多家社区企业',
    benefits: [
      ['社区企业等级体系', 'growth'],
      ['企业成员管理与权限分配', 'profile'],
      ['专属社区企业名片（企业库展示）', 'profile'],
      ['社区企业专属需求响应', 'demand'],
      ['社区企业专属活动', 'access'],
      ['社区企业专属空间预约', 'access'],
      ['以社区企业身份投稿', 'content'],
    ],
    cta: { label: '去企业入驻', to: '/intros/settle' },
  }),
  guideItem({
    type: 'external_enterprise',
    how: '完成合作伙伴登记',
    limit: '1 个账号可关联多家合作企业',
    benefits: [
      ['合作企业专属需求响应', 'demand'],
      ['合作企业专属活动', 'access'],
      ['合作企业专属空间预约', 'access'],
      ['以合作企业身份投稿', 'content'],
    ],
    cta: { label: '去企业合作', to: '/intros/enterprise' },
  }),
]

function go(path: string) {
  void router.push(path)
}
</script>

<template>
  <div class="page-fade-in identity-guide">
    <!-- 主张：一账号多重身份，权益逐身份叠加 -->
    <section class="m-card hero">
      <h2 class="hero-title">四种身份，一套账号</h2>
      <p class="hero-desc">
        同一个账号可以叠加多重身份，权益按身份累加：注册即得个人用户的基础权益，再进阶解锁等级成长与专属机会。
      </p>
      <div class="hero-ladder">
        <span class="ladder-step">基础 · 个人用户</span>
        <Icon aria-hidden="true" name="chevron-right" size="14px" class="ladder-arrow" />
        <span class="ladder-step is-advanced">进阶 · 社区个体 / 社区企业 / 合作企业</span>
      </div>
    </section>

    <!-- 基础身份：所有注册用户都拥有 -->
    <section class="m-card identity-card">
      <div class="card-head">
        <IdentityTag :type="baseline.type" />
        <Tag size="small" variant="outline" theme="default">默认身份 · 注册即得</Tag>
      </div>
      <p class="card-how">{{ baseline.how }}</p>
      <dl class="meta">
        <dt>限制</dt>
        <dd>{{ baseline.limit }}</dd>
      </dl>

      <div class="benefit-block">
        <div v-for="group in baseline.groups" :key="group.key" class="benefit-group">
          <span class="benefit-group-label">{{ group.label }}</span>
          <div class="benefit-tags">
            <Tag
              v-for="label in group.items"
              :key="label"
              class="benefit-tag"
              :class="{ 'benefit-tag--demand': group.key === 'demand' }"
              size="small"
              variant="light"
              :theme="group.theme"
            >
              {{ label }}
            </Tag>
          </div>
        </div>
      </div>
    </section>

    <!-- 进阶身份：在基础权益之上新增 -->
    <section v-for="item in advanced" :key="item.type" class="m-card identity-card">
      <div class="card-head">
        <IdentityTag :type="item.type" />
        <Tag size="small" variant="outline" theme="default">基础权益 + {{ item.benefitCount }} 项新增</Tag>
      </div>
      <p class="card-how">{{ item.how }}</p>
      <dl class="meta">
        <dt>限制</dt>
        <dd>{{ item.limit }}</dd>
      </dl>

      <div class="benefit-block">
        <div v-for="group in item.groups" :key="group.key" class="benefit-group">
          <span class="benefit-group-label">{{ group.label }}</span>
          <div class="benefit-tags">
            <Tag
              v-for="label in group.items"
              :key="label"
              class="benefit-tag"
              :class="{ 'benefit-tag--demand': group.key === 'demand' }"
              size="small"
              variant="light"
              :theme="group.theme"
            >
              {{ label }}
            </Tag>
          </div>
        </div>
      </div>

      <Button v-if="item.cta" class="card-cta" theme="primary" variant="outline" block @click="go(item.cta.to)">
        {{ item.cta.label }}
        <template #suffix><Icon aria-hidden="true" name="chevron-right" size="14px" /></template>
      </Button>
    </section>

    <!-- 口径说明：身份叠加、等级范围、专属权益含义 -->
    <section class="rules">
      <CellGroup theme="card">
        <Cell title="身份可叠加" description="同一账号可同时持有多个身份，切换身份即可用对应身份发布需求、响应、投稿或预约。" />
        <Cell title="等级与经验值" description="等级成长体系仅对社区个体与社区企业身份生效，经验值越高等级越高，可享专属报名与积分消费折扣。" />
        <Cell title="「专属」权益" description="指仅面向该身份开放的需求、活动与空间预约；范围由社区运营在可见/可预约范围中配置。" />
      </CellGroup>
    </section>
  </div>
</template>

<style scoped>
.identity-guide {
  padding: var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
}

.hero {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.hero-title {
  margin: 0;
  font: var(--app-type-page-title);
  overflow-wrap: anywhere;
}

.hero-desc {
  margin: 0;
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
  overflow-wrap: anywhere;
}

/* 身份路径：基础 → 进阶两段文字，进阶段用品牌色+强调字重提升层级（不使用额外色块，避免与权益标签争色） */
.hero-ladder {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--app-space-3);
  margin-top: var(--app-space-4);
}

.ladder-step {
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
  overflow-wrap: anywhere;
}

.ladder-step.is-advanced {
  font: var(--app-type-emphasis-xs);
  color: var(--td-text-color-brand);
}

.ladder-arrow {
  flex-shrink: 0;
  color: var(--td-text-color-placeholder);
}

.identity-card {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
}

.card-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--app-space-4);
}

.card-how {
  margin: 0;
  font: var(--app-type-body);
  color: var(--td-text-color-primary);
  overflow-wrap: anywhere;
}

.meta {
  display: flex;
  align-items: baseline;
  gap: var(--app-space-4);
  margin: 0;
  font: var(--app-type-body-sm);
}

.meta dt {
  flex-shrink: 0;
  color: var(--td-text-color-placeholder);
}

.meta dd {
  margin: 0;
  color: var(--td-text-color-secondary);
  min-width: 0;
  overflow-wrap: anywhere;
}

/* 权益区：与「获取方式 / 限制」之间用分隔线分区（结构用描边，不用阴影）；
 * 类别名固定列宽（4 个徽标宽），使各行标签左边缘对齐成一张对照表 */
.benefit-block {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
  padding-top: var(--app-space-7);
  border-top: 1px solid var(--td-component-border);
}

.benefit-group {
  display: flex;
  align-items: baseline;
  gap: var(--app-space-3);
}

.benefit-group-label {
  flex: 0 0 auto;
  width: calc(var(--app-space-8) * 4);
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
  white-space: nowrap;
}

.benefit-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--app-space-3);
  min-width: 0;
}

/* 「需求撮合」类别色改用主题主色阶：标签的品牌槽（--td-tag-primary-*）跟随主题「强调色」，
 * 强调色可能落在橙/绿/红上，与语义类别（成长绿 / 名片橙 / 名额红）撞色，四类分不清；
 * 主色阶则恒为主题主色（公版为品牌蓝），与语义色互不干扰。
 * 文字取 -6 档（非 -7/-8 深档）：主色往往近黑，取中深档才看得出是「蓝」而不是「灰」。
 * 变量写在标签元素上，库内 .t-tag--light.t-tag--primary 的 var() 取值即被改到本值，无需拼优先级。 */
.benefit-tag--demand {
  --td-tag-primary-color: var(--td-brand-color-6, var(--td-brand-color));
  --td-tag-primary-light-color: var(--td-brand-color-1, var(--td-brand-color-light));
}

/* 深色模式下主色阶两端反转：亮档在 -9/-10，换到此处保证对比度 */
:root.dark .benefit-tag--demand {
  --td-tag-primary-color: var(--td-brand-color-9, var(--td-brand-color-7));
}

.card-cta {
  margin-top: var(--app-space-2);
}

/* CellGroup 自带左右 16px 外边距，与页面 padding 叠加会导致卡片偏窄 */
.rules :deep(.t-cell-group--card) {
  margin: 0;
  border: 1px solid var(--td-component-border);
}
</style>
