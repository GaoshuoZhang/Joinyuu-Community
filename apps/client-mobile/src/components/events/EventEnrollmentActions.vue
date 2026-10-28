<script setup lang="ts">
import { computed } from 'vue'
import { Button, Icon, Tag } from 'tdesign-mobile-vue'
import type { CommunityEvent } from '@/types'
import { formatFen } from '@/utils/money'

/* 报名操作区：按报名态分流（待审核/已通过/候补/被驳回/未报名），
 * 统一悬浮固定在详情页底部，避免主操作脱离拇指区；页面内容区需为其预留底部空间。 */
const props = defineProps<{
  event: CommunityEvent
  myStatus?: string
  myCheckedIn: boolean
  loggedIn: boolean
  acting: boolean
  cancelBlocked: boolean
  disableReason: string
  enrollForbidden: boolean
}>()

const cashAmountFen = computed(() => props.event.chargeAmountFen ?? 0)

/* 报名要求标签（后台活动开关）：报名需审核 / 需绑定手机号 / 需绑定邮箱，
 * 展示在报名按钮上方，取代原先的整句提示文案 */
const requirementTags = computed(() => {
  const list: string[] = []
  if (cashAmountFen.value > 0) list.push(`收费 ${formatFen(cashAmountFen.value)}/人次`)
  if (props.event.requireReview) list.push('报名需审核')
  if (props.event.enrollRequirePhone) list.push('需绑定手机号')
  if (props.event.enrollRequireEmail) list.push('需绑定邮箱')
  return list
})

const emit = defineEmits<{
  enroll: []
  cancel: []
  checkIn: []
  pay: []
}>()
</script>

<template>
  <Teleport to="body">
    <div class="event-enrollment-bar" role="group" aria-label="报名操作">
      <template v-if="myStatus === 'pending'">
        <p class="bar-line">审核结果将通过站内信通知</p>
        <Button v-if="!myCheckedIn && !cancelBlocked" theme="default" variant="outline" block :disabled="acting" @click="emit('cancel')">取消报名</Button>
        <p v-else-if="!myCheckedIn" class="bar-hint">
          当前无法取消报名，如需协助<template v-if="loggedIn">可<router-link class="bar-link" to="/me/messages">给社区留言</router-link></template>
          <template v-else>请联系社区运营</template>
        </p>
      </template>

      <template v-else-if="myStatus === 'pending_payment'">
        <p class="bar-line">已提交报名，待完成付款</p>
        <Button theme="primary" block :disabled="acting" @click="emit('pay')">继续支付</Button>
        <p class="bar-hint">付款成功后报名与电子票才会生效；如需取消请在「现金交易」中操作。</p>
      </template>

      <template v-else-if="myStatus === 'approved'">
        <p v-if="myCheckedIn" class="bar-line ok"><Icon aria-hidden="true" name="check-circle" size="16px" />已签到</p>
        <p v-else class="bar-line">记得准时参加</p>
        <Button v-if="!myCheckedIn" theme="primary" block :disabled="acting" @click="emit('checkIn')">签到</Button>
        <Button v-if="!cancelBlocked && cashAmountFen <= 0" theme="default" variant="outline" block :disabled="acting" @click="emit('cancel')">取消报名</Button>
        <p v-else-if="cashAmountFen > 0" class="bar-hint">现金报名如需退款，请在<router-link class="bar-link" to="/me/transactions">现金交易</router-link>中申请。</p>
        <p v-else class="bar-hint">
          已到活动开始前 {{ event.cancelDeadlineHours ?? 24 }} 小时的取消截止时间，如需协助<template v-if="loggedIn">可<router-link class="bar-link" to="/me/messages">给社区留言</router-link></template>
          <template v-else>请联系社区运营</template>
        </p>
      </template>

      <template v-else-if="myStatus === 'waitlisted'">
        <p class="bar-line">有空位时将按顺序自动递补并通知你</p>
        <Button v-if="!cancelBlocked" theme="default" variant="outline" block :disabled="acting" @click="emit('cancel')">退出候补</Button>
      </template>

      <template v-else-if="myStatus === 'rejected'">
        <p class="bar-line">可调整报名条件后重新提交</p>
        <p v-if="event.myEnrollmentRejectReason" class="bar-reason">原因：{{ event.myEnrollmentRejectReason }}</p>
        <Button v-if="event.enrollmentOpen === false" theme="primary" block disabled>报名未开放</Button>
        <Button v-else-if="enrollForbidden" theme="primary" block disabled>当前身份无报名权限</Button>
        <Button v-else-if="!disableReason" theme="primary" block :disabled="acting" @click="emit('enroll')">重新报名</Button>
        <p v-else class="bar-reason">{{ disableReason }}</p>
      </template>

      <template v-else>
        <p v-if="loggedIn && disableReason && !enrollForbidden" class="bar-reason">{{ disableReason }}</p>
        <!-- 报名要求以标签呈现（替代原提示文字），置于报名按钮上方 -->
        <div v-if="requirementTags.length" class="bar-tags">
          <Tag v-for="tag in requirementTags" :key="tag" size="small" variant="light" theme="default">{{ tag }}</Tag>
        </div>
        <Button v-if="event.enrollmentOpen === false" theme="primary" block disabled>报名未开放</Button>
        <Button v-else-if="!loggedIn" theme="primary" block @click="emit('enroll')">登录后报名</Button>
        <Button v-else theme="primary" block :disabled="acting || !!disableReason" @click="emit('enroll')">
          {{ acting ? '报名中…' : enrollForbidden ? '当前身份无报名权限' : cashAmountFen > 0 ? '立即报名并支付' : '立即报名' }}
        </Button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.event-enrollment-bar {
  background: var(--td-bg-color-container);
  border-top: 1px solid var(--td-component-border);
  box-shadow: var(--app-action-bar-shadow);
}

.bar-line {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--app-space-4);
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
}

.bar-line.ok {
  color: var(--td-success-color);
}

.bar-hint {
  margin: 0;
  font: var(--app-type-body-sm);
  color: var(--td-text-color-placeholder);
}

/* 报名要求标签行：与按钮左对齐、可换行 */
.bar-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--app-space-4);
}

/* 留言入口：文字链形态，内联在提示文案中 */
.bar-link {
  color: var(--td-brand-color);
}

.bar-reason {
  margin: 0;
  font: var(--app-type-body-sm);
  color: var(--td-error-color);
}
</style>
