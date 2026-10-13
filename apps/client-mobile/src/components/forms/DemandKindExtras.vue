<script setup lang="ts">
import { ref } from 'vue'
import { Button, Cell, DateTimePicker, Input, Popup, Textarea } from 'tdesign-mobile-vue'
import type { DemandKind } from '@/types'
import { formatLocalDate } from '@/utils/format'

/* 需求发布表单：按类型展示的扩展字段（期望交付/投资合作/合作诉求）。
 * 必填口径与 DemandFormView / ContactFields 一致：标签为「文案 + 红色 *」，错误行统一 .field-error。 */
export interface DemandExtrasErrors {
  deliverable: string
  deliverBy: string
  cooperationNeed: string
  bottleneck: string
}

const props = defineProps<{
  kind: DemandKind
  errors: DemandExtrasErrors
  todayStr: string
  showDeliverBy: boolean
}>()

const emit = defineEmits<{ 'update:showDeliverBy': [boolean] }>()

const deliverable = defineModel<string>('deliverable', { required: true })
const budget = defineModel<string>('budget', { required: true })
const deliverBy = defineModel<string>('deliverBy', { required: true })
const cooperationNeed = defineModel<string>('cooperationNeed', { required: true })
const returnOffer = defineModel<string>('returnOffer', { required: true })
const bottleneck = defineModel<string>('bottleneck', { required: true })
const partnershipMode = defineModel<string>('partnershipMode', { required: true })
const draftDeliverBy = ref('')

function openDeliverBy() {
  draftDeliverBy.value = deliverBy.value || props.todayStr
  emit('update:showDeliverBy', true)
}

function confirmDeliverBy(value: string | number | Date) {
  deliverBy.value = typeof value === 'string' ? value : formatLocalDate(value)
  emit('update:showDeliverBy', false)
}

/** 清除已选日期：只置空字段值，不改动日期格式与提交载荷结构 */
function clearDeliverBy() {
  deliverBy.value = ''
}
</script>

<template>
  <template v-if="kind === 'task'">
    <div class="field">
      <label>期望交付<span class="req"> *</span></label>
      <Textarea
        v-model="deliverable"
        :autosize="{ minRows: 3, maxRows: 6 }"
        :maxlength="500"
        placeholder="希望对方交付什么（成果物、验收标准、周期…）…"
      />
      <p v-if="errors.deliverable" class="field-error">{{ errors.deliverable }}</p>
    </div>
    <div class="field">
      <label>预算范围（选填）</label>
      <Input v-model="budget" :maxlength="50" placeholder="如：¥8,000 - 15,000 / 面议…" clearable />
    </div>
    <div class="field">
      <span class="field-label">预期交付日期<span class="req"> *</span></span>
      <!-- 未选日期时标题用弱化色（--td-cell-title-color）；已选时在 note 槽给出 44px 命中区的清除入口 -->
      <Cell
        v-pressable
        class="date-trigger"
        :class="{ 'is-empty': !deliverBy }"
        :title="deliverBy || '请选择预期交付日期'"
        arrow
        @click="openDeliverBy"
      >
        <template v-if="deliverBy" #note>
          <Button size="small" variant="text" class="date-clear" @click.stop="clearDeliverBy">清除</Button>
        </template>
      </Cell>
      <Popup :visible="showDeliverBy" placement="bottom" @update:visible="(value: boolean) => emit('update:showDeliverBy', value)">
        <DateTimePicker
          v-model="draftDeliverBy"
          mode="date"
          format="YYYY-MM-DD"
          :start="todayStr"
          title="选择预期交付日期"
          @confirm="confirmDeliverBy"
          @cancel="emit('update:showDeliverBy', false)"
        />
      </Popup>
      <p v-if="errors.deliverBy" class="field-error">{{ errors.deliverBy }}</p>
    </div>
  </template>

  <template v-else-if="kind === 'investment'">
    <div class="field">
      <label>希望获得的投资 / 合作<span class="req"> *</span></label>
      <Textarea
        v-model="cooperationNeed"
        :autosize="{ minRows: 3, maxRows: 6 }"
        :maxlength="500"
        placeholder="如：天使轮融资 50 万、渠道资源合作、联合研发…"
      />
      <p v-if="errors.cooperationNeed" class="field-error">{{ errors.cooperationNeed }}</p>
    </div>
    <div class="field">
      <label>可提供的回报与资源（选填）</label>
      <Textarea
        v-model="returnOffer"
        :autosize="{ minRows: 3, maxRows: 6 }"
        :maxlength="500"
        placeholder="如：股权、项目分红、技术与团队能力…"
      />
    </div>
  </template>

  <template v-else>
    <div class="field">
      <label>业务瓶颈与合作诉求<span class="req"> *</span></label>
      <Textarea
        v-model="bottleneck"
        :autosize="{ minRows: 3, maxRows: 6 }"
        :maxlength="500"
        placeholder="当前卡在哪里、希望对方补足什么能力或资源…"
      />
      <p v-if="errors.bottleneck" class="field-error">{{ errors.bottleneck }}</p>
    </div>
    <div class="field">
      <label>期望的合作方式（选填）</label>
      <Input v-model="partnershipMode" :maxlength="80" placeholder="如：项目制合作、联合运营、渠道分成…" clearable />
    </div>
    <div class="field">
      <label>可提供的资源与回报（选填）</label>
      <Textarea
        v-model="returnOffer"
        :autosize="{ minRows: 3, maxRows: 6 }"
        :maxlength="500"
        placeholder="如：客户资源、供应链能力、收益分成…"
      />
    </div>
  </template>
</template>

<style scoped>
/* 字段容器/错误/必填标识沿用 DemandFormView、ContactFields 的同一口径（scoped 样式无法跨组件复用宿主类名，
 * 故这里保持逐条一致的声明，不引入第二套写法）。 */
.field {
  margin-bottom: var(--app-space-8);
}

.field label,
.field .field-label {
  display: block;
  font: var(--app-type-body);
  margin-bottom: var(--app-space-4);
  color: var(--td-text-color-secondary);
}

.field-error {
  margin: var(--app-space-3) 0 0;
  font: var(--app-type-caption);
  color: var(--td-error-color);
}

/* 必填标识（与 SchemaField 的 .req 同口径） */
.req {
  color: var(--td-error-color);
}

.date-trigger {
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-large);
}

/* 未选日期：标题降级为占位色（复用官方 Cell 颜色变量，无需穿透子组件） */
.date-trigger.is-empty {
  --td-cell-title-color: var(--td-text-color-placeholder);
}

.date-clear {
  margin-left: var(--app-space-3);
}
</style>
