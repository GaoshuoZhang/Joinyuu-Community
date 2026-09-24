<script setup lang="ts">
import { ref } from 'vue'
import { Button, Collapse, CollapsePanel, Dialog, Icon } from 'tdesign-mobile-vue'

export interface ActivationStep {
  key: string
  label: string
  done: boolean
  path: string
}

/* 新手任务默认折叠（v49）：先呈现「新手任务」标题行，展开后再看任务；永久隐藏需单独确认。 */
defineProps<{ steps: ActivationStep[] }>()
const emit = defineEmits<{ dismiss: [] }>()

const PANEL_VALUE = 'activation-tasks'
const PANEL_CONTENT_ID = 'activation-checklist-content'
const expandedPanels = ref<Array<string | number>>([])
const confirmVisible = ref(false)
const isExpanded = () => expandedPanels.value.includes(PANEL_VALUE)

function togglePanel() {
  expandedPanels.value = isExpanded() ? [] : [PANEL_VALUE]
}

function confirmDismiss() {
  confirmVisible.value = false
  emit('dismiss')
}
</script>

<template>
  <section class="m-card activation" aria-label="新手任务">
    <Collapse v-model:value="expandedPanels" class="activation-collapse">
      <CollapsePanel :value="PANEL_VALUE">
        <template #header>
          <button
            type="button"
            class="activation-toggle"
            :aria-expanded="isExpanded()"
            :aria-controls="PANEL_CONTENT_ID"
            :aria-label="isExpanded() ? '收起新手任务' : '展开新手任务'"
            @click.stop="togglePanel"
          >
            新手任务
          </button>
        </template>
        <template #header-right-content>
          <Button
            class="activation-hide"
            size="small"
            variant="text"
            theme="default"
            aria-label="永久隐藏新手任务"
            @click.stop="confirmVisible = true"
          >
            永久隐藏
          </Button>
        </template>

        <div :id="PANEL_CONTENT_ID">
          <p class="activation-desc">完成以下任务，解锁社区完整能力</p>
          <ul class="activation-list">
            <li v-for="step in steps" :key="step.key" :class="{ done: step.done }">
              <span v-if="step.done" class="activation-step">
                <Icon aria-hidden="true" name="check-circle-filled" size="16px" class="mark done" />{{ step.label }}
              </span>
              <router-link v-else class="activation-step" :to="step.path">
                <Icon aria-hidden="true" name="circle" size="16px" class="mark" />{{ step.label }}
              </router-link>
            </li>
          </ul>
        </div>
      </CollapsePanel>
    </Collapse>

    <Dialog
      v-model:visible="confirmVisible"
      title="永久隐藏新手任务？"
      content="确认后，此账号将不再显示新手任务卡片。"
      cancel-btn="取消"
      :confirm-btn="{ content: '确认隐藏', theme: 'danger' }"
      @confirm="confirmDismiss"
      @cancel="confirmVisible = false"
      @close="confirmVisible = false"
    />
  </section>
</template>

<style scoped>
.activation {
  padding: 0;
  overflow: hidden;
}

.activation-collapse {
  --td-collapse-content-padding: 0 var(--app-space-8) var(--app-space-8);
  background: transparent;
}

.activation-collapse :deep(.t-collapse-panel),
.activation-collapse :deep(.t-cell) {
  background: transparent;
}

.activation-toggle {
  width: 100%;
  min-height: 44px;
  padding: 0;
  border: 0;
  color: var(--td-text-color-primary);
  background: transparent;
  font: var(--app-type-section);
  text-align: left;
  cursor: pointer;
}

.activation-toggle:focus-visible {
  outline: 2px solid var(--td-brand-color);
  outline-offset: 2px;
}

.activation-hide {
  font: var(--app-type-body-sm);
  color: var(--td-text-color-placeholder);
}

.activation-desc {
  margin: 0 0 var(--app-space-5);
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.activation-list {
  margin:0;
  padding:0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
}

.activation-step {
  display: flex;
  align-items: center;
  gap: var(--app-space-4);
  min-height: 44px;
  font: var(--app-type-body);
  color: var(--td-text-color-primary);
  text-decoration: none;
  cursor: pointer;
}

.activation-list li.done .activation-step {
  color: var(--td-text-color-placeholder);
  cursor: default;
}

.activation-list .mark {
  flex-shrink: 0;
}

.activation-list .mark.done {
  color: var(--td-success-color);
}
</style>
