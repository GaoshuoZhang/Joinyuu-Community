<script setup lang="ts">
import { ref } from 'vue'
import { Button, Tag } from 'tdesign-mobile-vue'

/* v42 积分规则：获取 / 消耗 / 有效期与常见问题（静态说明 + 字典口径）。 */
const pointsSources = ['发布需求', '响应需求', '活动签到', '内容投稿', '社区共建']

const rules = ref([
  { title: '如何获得积分', items: ['发布需求、响应需求通过审核', '报名并参与活动、完成签到', '内容投稿通过审核', '参与社区共建与运营活动'] },
  { title: '积分可以做什么', items: ['积分商城兑换实物商品与权益券', '空间预约等社区服务优先权益', '后续开放的等级权益与专属活动'] },
  { title: '有效期与扣除', items: ['积分自获得之日起 12 个月内有效，逾期清零', '取消待发货订单会原路退回积分', '兑换成功扣减积分，退款按规则返还'] },
  { title: '常见问题', items: ['积分记录可在「我的积分」查看明细', '积分由符合规则的行为自动发放', '如对积分有疑问，可在「账号与安全」提交反馈'] },
])
</script>

<template>
  <div class="page-fade-in rules-page">
    <section class="m-card intro">
      <p class="intro-desc">积分是聚屿社区的贡献凭证，可用于兑换权益与社区服务。</p>
    </section>

    <section class="m-card">
      <h3 class="section-title">积分来源</h3>
      <div class="chips">
        <Tag v-for="s in pointsSources" :key="s" class="chip" size="small" variant="light" theme="primary">{{ s }}</Tag>
      </div>
    </section>

    <section v-for="r in rules" :key="r.title" class="m-card">
      <h3 class="section-title">{{ r.title }}</h3>
      <ul class="rule-list">
        <li v-for="(item, i) in r.items" :key="i">{{ item }}</li>
      </ul>
    </section>

    <Button variant="outline" block @click="$router.push('/me/points')">查看我的积分明细</Button>
  </div>
</template>

<style scoped>
.rules-page {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
  padding:var(--app-space-8);
}

.intro-desc {
  margin:var(--app-space-3) 0 0;
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
}

.section-title {
  margin:0 0 var(--app-space-4);
  /* 与全站章节标题（.sec-title 等）统一为 section 角色档 */
  font: var(--app-type-section);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap:var(--app-space-4);
}

.rule-list {
  margin:0;
  padding-left:var(--app-space-9);
  font: var(--app-type-body-relaxed);
  color: var(--td-text-color-secondary);
}
</style>
