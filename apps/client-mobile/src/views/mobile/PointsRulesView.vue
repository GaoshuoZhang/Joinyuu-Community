<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from 'tdesign-mobile-vue'

/* v42 积分规则：获取 / 消耗 / 有效期与常见问题（静态说明 + 字典口径）。 */
const router = useRouter()
const pointsSources = ['发布需求', '响应需求', '活动签到', '内容投稿', '社区共建']

const rules = ref([
  { title: '如何获得积分', items: ['完成任务中心任务并领取', '发布需求、响应需求通过审核', '报名并参与活动、完成签到', '内容投稿通过审核', '参与社区共建与运营活动'] },
  { title: '积分可以做什么', items: ['积分商城兑换实物、虚拟服务与权益券', '空间预约等社区服务优先权益', '后续开放的等级权益与专属活动'] },
  { title: '有效期与扣除', items: ['积分自获得之日起 12 个月内有效，逾期清零', '取消待发货订单会原路退回积分', '兑换成功扣减积分，退款按规则返还'] },
  { title: '常见问题', items: ['积分记录可在「我的积分」查看明细', '任务奖励每天可领取一次（每日任务）', '如对积分有疑问，可在「账号与安全」提交反馈'] },
])
</script>

<template>
  <div class="page-fade-in rules-page">
    <section class="m-card intro">
      <h2 class="intro-title">积分规则</h2>
      <p class="intro-desc">积分是聚屿社区的贡献凭证，可用于兑换权益与社区服务。</p>
    </section>

    <section class="m-card">
      <h3 class="section-title">积分来源</h3>
      <div class="chips">
        <span v-for="s in pointsSources" :key="s" class="chip">{{ s }}</span>
      </div>
    </section>

    <section v-for="r in rules" :key="r.title" class="m-card">
      <h3 class="section-title">{{ r.title }}</h3>
      <ul class="rule-list">
        <li v-for="(item, i) in r.items" :key="i">{{ item }}</li>
      </ul>
    </section>

    <Button theme="primary" block @click="router.push('/me/tasks')">去任务中心赚积分</Button>
    <Button variant="outline" block @click="router.push('/me/points')">查看我的积分明细</Button>
  </div>
</template>

<style scoped>
.rules-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.intro-title {
  margin: 0;
  font-size: 18px;
}

.intro-desc {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.section-title {
  margin: 0 0 8px;
  font-size: 14px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  padding: 4px 10px;
  border-radius: var(--td-tag-square-border-radius, 4px);
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
  font-size: 12px;
}

.rule-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.9;
  color: var(--td-text-color-secondary);
}
</style>
