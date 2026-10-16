<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Button, Cell, CellGroup, Icon, Tag } from 'tdesign-mobile-vue'
import IdentityTag from '@/components/shared/IdentityTag.vue'
import type { IdentityType } from '@/types'

/* 身份说明：四种关联身份的获取方式、限制与权益（入口在「关联身份」页底部）。
 * 说明口径（与权限实现一致）：同一账号可叠加多重身份，权益逐身份累加；
 * 等级与经验值仅对社区个体 / 社区企业生效；「专属」类权益指仅面向该身份开放的需求 / 活动 / 空间。 */
const router = useRouter()

interface IdentityGuideItem {
  type: IdentityType
  /** 表格「获取方式」列 */
  how: string
  /** 表格「限制」列 */
  limit: string
  /** 表格「权益」列：个人用户列基础权益，其余列「在此基础上新增」的权益 */
  benefits: string[]
  /** 进阶身份的行动入口（个人用户为默认身份，无入口） */
  cta?: { label: string; to: string }
}

/* 个人用户：注册即得的默认身份（其余身份都在此基础上叠加） */
const baseline: IdentityGuideItem = {
  type: 'individual',
  how: '注册账号即自动获得',
  limit: '默认身份，人手一份，不可取消',
  benefits: ['需求发布', '公开需求响应', '文章投稿', '积分商城兑换', '公共空间预约', '公开活动报名'],
}

const advanced: IdentityGuideItem[] = [
  {
    type: 'community_individual',
    how: '完成人才登记并通过审核',
    limit: '1 个账号 1 个社区个体身份',
    benefits: ['社区个体等级体系', '社区个体专属名片（人才库展示）', '社区个体专属需求响应', '社区个体专属活动', '社区个体专属空间预约', '以社区个体身份投稿'],
    cta: { label: '去人才登记', to: '/intros/talent' },
  },
  {
    type: 'community_enterprise',
    how: '完成企业入驻并通过审核',
    limit: '1 个账号可关联多家社区企业',
    benefits: ['社区企业等级体系', '企业成员管理与权限分配', '专属社区企业名片（企业库展示）', '社区企业专属需求响应', '社区企业专属活动', '社区企业专属空间预约', '以社区企业身份投稿'],
    cta: { label: '去企业入驻', to: '/intros/settle' },
  },
  {
    type: 'external_enterprise',
    how: '完成合作伙伴登记',
    limit: '1 个账号可关联多家合作企业',
    benefits: ['合作企业专属需求响应', '合作企业专属活动', '合作企业专属空间预约', '以合作企业身份投稿'],
    cta: { label: '去企业合作', to: '/intros/enterprise' },
  },
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
      <p class="hero-desc">同一个账号可以叠加多重身份，权益按身份累加：先成为社区个体或关联企业，解锁等级成长与专属机会。</p>
      <div class="hero-ladder">
        <span class="ladder-step">个人用户</span>
        <Icon aria-hidden="true" name="chevron-right" size="14px" class="ladder-arrow" />
        <span class="ladder-step is-core">社区个体</span>
        <Icon aria-hidden="true" name="chevron-right" size="14px" class="ladder-arrow" />
        <span class="ladder-step">社区企业 / 合作企业</span>
      </div>
    </section>

    <!-- 基础身份：所有注册用户都拥有 -->
    <section class="m-card identity-card">
      <div class="card-head">
        <IdentityTag :type="baseline.type" />
        <Tag size="small" variant="light" theme="default">默认身份</Tag>
      </div>
      <p class="card-how">{{ baseline.how }}</p>
      <dl class="meta">
        <dt>限制</dt>
        <dd>{{ baseline.limit }}</dd>
      </dl>
      <p class="benefit-title">基础权益</p>
      <div class="benefit-tags">
        <Tag v-for="item in baseline.benefits" :key="item" size="small" variant="light" theme="default">{{ item }}</Tag>
      </div>
    </section>

    <!-- 进阶身份：在基础权益之上新增 -->
    <section v-for="item in advanced" :key="item.type" class="m-card identity-card">
      <div class="card-head">
        <IdentityTag :type="item.type" />
        <Tag size="small" variant="light" theme="primary">在基础权益上新增</Tag>
      </div>
      <p class="card-how">{{ item.how }}</p>
      <dl class="meta">
        <dt>限制</dt>
        <dd>{{ item.limit }}</dd>
      </dl>
      <p class="benefit-title">新增权益</p>
      <div class="benefit-tags">
        <Tag v-for="benefit in item.benefits" :key="benefit" size="small" variant="light" theme="primary">{{ benefit }}</Tag>
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

/* 身份阶梯：三段式路径示意（个人用户 → 社区个体 → 社区企业/合作企业） */
.hero-ladder {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--app-space-3);
  margin-top: var(--app-space-4);
}

.ladder-step {
  padding: 2px 10px;
  border-radius: var(--td-radius-round);
  border: 1px solid var(--td-component-border);
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.ladder-step.is-core {
  border-color: var(--td-brand-color);
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

.benefit-title {
  margin: 0;
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.benefit-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--app-space-3);
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
