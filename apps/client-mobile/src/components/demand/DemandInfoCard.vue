<script setup lang="ts">
import { Button, Icon, Tag } from 'tdesign-mobile-vue'
import IdentityTag from '@/components/shared/IdentityTag.vue'
import StateTag from '@/components/shared/StateTag.vue'
import { DEMAND_KIND_LABELS, demandDateText } from '@/constants/demand'
import type { Demand } from '@/types'
import RichTextBlock from '@/components/shared/RichTextBlock.vue'
import { formatZhNumber } from '@/utils/format'

/* 需求详情信息卡：标题/状态/分类/发布方/描述/分类扩展字段/联系信息/收藏分享。
 * 联系信息由后端按需求「公开联系人」开关下发：开启时（含未登录访客）展示，关闭时不下发。 */
defineProps<{ demand: Demand; favorited: boolean }>()
defineEmits<{ toggleFavorite: []; share: [] }>()
</script>

<template>
  <div class="m-card">
    <div class="head">
      <h2 class="title">{{ demand.title }}</h2>
      <StateTag kind="demand" :value="demand.status" />
    </div>
    <div class="meta">
      <Tag class="cat" size="small" variant="light" theme="primary">{{ demand.categoryLabel }}</Tag>
      <Tag v-if="demand.kind" class="kind" size="small" variant="light" theme="default">{{ DEMAND_KIND_LABELS[demand.kind] }}</Tag>
      <span class="pub">
        <IdentityTag :type="demand.publisherIdentity" :label="demand.publisherIdentityLabel" />
        <span>{{ demand.publisherName }}</span>
      </span>
    </div>
    <p class="deadline">
      <span v-if="demandDateText(demand)">{{ demandDateText(demand) }} · </span>{{ formatZhNumber(demand.responseCount) }} 人响应
    </p>
    <RichTextBlock class="desc" :html="demand.description" />
    <div v-if="demand.kind === 'task' && (demand.deliverable || demand.budget)" class="extras">
      <p v-if="demand.deliverable"><b>期望交付：</b>{{ demand.deliverable }}</p>
      <p v-if="demand.budget"><b>预算范围：</b>{{ demand.budget }}</p>
    </div>
    <div v-else-if="demand.kind === 'investment' && (demand.cooperationNeed || demand.returnOffer)" class="extras">
      <p v-if="demand.cooperationNeed"><b>希望获得：</b>{{ demand.cooperationNeed }}</p>
      <p v-if="demand.returnOffer"><b>可提供回报：</b>{{ demand.returnOffer }}</p>
    </div>
    <div
      v-else-if="demand.kind === 'cooperation' && (demand.bottleneck || demand.partnershipMode || demand.returnOffer)"
      class="extras"
    >
      <p v-if="demand.bottleneck"><b>合作诉求：</b>{{ demand.bottleneck }}</p>
      <p v-if="demand.partnershipMode"><b>期望合作方式：</b>{{ demand.partnershipMode }}</p>
      <p v-if="demand.returnOffer"><b>可提供资源：</b>{{ demand.returnOffer }}</p>
    </div>

    <div v-if="demand.contactName || demand.contactPhone || demand.contactEmail" class="extras">
      <p v-if="demand.contactName"><b>联系人：</b>{{ demand.contactName }}</p>
      <p v-if="demand.contactPhone">
        <b>联系电话：</b>
        <a class="tel" :href="`tel:${demand.contactPhone}`">{{ demand.contactPhone }}</a>
      </p>
      <p v-if="demand.contactEmail"><b>联系邮箱：</b>{{ demand.contactEmail }}</p>
    </div>
    <div class="fav-row">
      <Button size="small" variant="outline" @click="$emit('toggleFavorite')">
        <template #icon><Icon aria-hidden="true" :name="favorited ? 'star-filled' : 'star'" size="16px" /></template>
        {{ favorited ? '已收藏' : '收藏' }}
      </Button>
      <Button size="small" variant="outline" @click="$emit('share')">
        <template #icon><Icon aria-hidden="true" name="share" size="16px" /></template>
        分享
      </Button>
    </div>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-4);
}

.title {
  margin:0;
  font-size: var(--app-font-title);
  line-height: 1.45;
  flex: 1;
}

.meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--app-space-5);
  margin-top: var(--app-space-5);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.cat,
.kind {
  flex-shrink: 0;
}

.pub {
  display: inline-flex;
  align-items: center;
  gap:var(--app-space-3);
}

.deadline {
  margin: var(--app-space-4) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.desc {
  margin: var(--app-space-7) 0 0;
  font-size: var(--app-font-body);
  line-height: 1.8;
  white-space: pre-wrap;
  color: var(--td-text-color-primary);
}

.extras {
  margin-top: var(--app-space-6);
  padding-top: var(--app-space-5);
  border-top: 1px dashed var(--td-component-border);
}

.extras p {
  margin: 0 0 var(--app-space-3);
  font-size: var(--app-font-body);
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.extras p:last-child {
  margin-bottom:0;
}

.extras b {
  color: var(--td-text-color-primary);
  font-weight: 600;
}

/* 联系电话：tel: 可拨号链接，命中区抬到 44px 触控基线（同 LoginView 文字链口径）；
 * 文字颜色继承信息行、不加下划线，不引入额外的链接样式（该行随之获得 44px 行高）。 */
.tel {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: inherit;
  text-decoration: none;
}

.fav-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--app-space-4);
  margin-top: var(--app-space-4);
}
</style>
