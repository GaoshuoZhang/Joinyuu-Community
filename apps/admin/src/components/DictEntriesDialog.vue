<script setup lang="ts">
import { useDialogFormProtection } from '@/utils/form'
import { computed, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon, DeleteIcon } from 'tdesign-icons-vue-next'
import { createDictEntry, deleteDictEntry, fetchDictEntries, toggleDictEntry } from '@/api/dicts'
import type { DictEntry, DictType } from '@/types'

/* 字典项维护弹窗（需求类别 / 活动类型 / 行业）：原「系统管理 > 数据字典」入口按类型迁移到各业务页页头。
 * 字典项 label 即业务存储值，改名会让历史数据失配 → 与迁移前一致，仅支持新增 / 启停 / 删除。 */

const props = defineProps<{
  visible: boolean
  type: DictType
  /** 弹窗标题 */
  title: string
  /** 字典项名词，用于占位符/空态/校验提示（默认同 title；「行业管理」这类带动作的标题需单独传「行业」） */
  entryName?: string
}>()
const emit = defineEmits<{ 'update:visible': [boolean]; success: [] }>()

const noun = computed(() => props.entryName?.trim() || props.title)

const loading = ref(false)
const submitting = ref(false)
const acting = ref('')
const entries = ref<DictEntry[]>([])
const newLabel = ref('')

async function load() {
  loading.value = true
  try {
    entries.value = await fetchDictEntries(props.type)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '字典加载失败')
  } finally {
    loading.value = false
  }
}

async function onCreate() {
  const label = newLabel.value.trim()
  if (!label) return void MessagePlugin.warning(`请输入${noun.value}名称`)
  submitting.value = true
  try {
    await createDictEntry(props.type, { label })
    MessagePlugin.success('新增成功（已启用）')
    newLabel.value = ''
    markBaseline()
    await load()
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '新增失败')
  } finally {
    submitting.value = false
  }
}

async function onToggle(entry: DictEntry) {
  acting.value = entry.code
  try {
    await toggleDictEntry(props.type, entry.code)
    await load()
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

async function onDelete(entry: DictEntry) {
  acting.value = entry.code
  try {
    await deleteDictEntry(props.type, entry.code)
    MessagePlugin.success('已删除')
    await load()
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    acting.value = ''
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      newLabel.value = ''
      void load()
    }
  },
)
const protectedVisible = computed({ get: () => props.visible, set: (value) => emit('update:visible', value) })
const { close: closeEditor, markBaseline } = useDialogFormProtection(() => newLabel.value, protectedVisible, submitting)
</script>

<template>
  <t-dialog :visible="visible" :header="title" width="640px" :footer="false" @close="closeEditor">
    <div class="dict-body">
      <p class="panel-tip">站点选项词汇的单一来源：新增即启用，停用后不再作为选项下发；已产生的历史业务数据不受删除影响。</p>
      <div class="dict-form">
        <t-input
          v-accessible-field="`${noun}名称`"
          v-model="newLabel"
          :maxlength="16"
          clearable
          :placeholder="`新增${noun}（新增即启用）…`"
          @enter="onCreate"
        />
        <t-button theme="primary" :loading="submitting" @click="onCreate">
          <template #icon><AddIcon /></template>
          新增
        </t-button>
      </div>
      <t-loading :loading="loading" size="small">
        <t-list v-if="entries.length" size="small">
          <t-list-item v-for="entry in entries" :key="entry.code">
            <div class="dict-item">
              <span class="dict-label">{{ entry.label }}</span>
              <t-tag variant="outline" size="small">{{ entry.code }}</t-tag>
              <t-tag v-if="entry.status !== 'enabled'" theme="warning" variant="light" size="small">已停用</t-tag>
            </div>
            <template #action>
              <div class="dict-actions">
                <t-switch
                  v-accessible-field="`${noun}「${entry.label}」启用状态`"
                  :value="entry.status === 'enabled'"
                  :loading="acting === entry.code"
                  :aria-label="`${noun}「${entry.label}」启用状态`"
                  @change="() => onToggle(entry)"
                />
                <t-popconfirm
                  :content="`确认删除「${entry.label}」？已产生的历史业务数据不受影响，仅不再作为选项下发。`"
                  @confirm="onDelete(entry)"
                >
                  <t-button variant="text" theme="danger" size="small" :loading="acting === entry.code">
                    <template #icon><DeleteIcon /></template>
                    删除
                  </t-button>
                </t-popconfirm>
              </div>
            </template>
          </t-list-item>
        </t-list>
        <t-empty v-else :description="`暂无${noun}，请在上方新增`" />
      </t-loading>
    </div>
  </t-dialog>
</template>

<style scoped>
.dict-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 70vh;
  overflow-y: auto;
  /* 滚到边界时不将滚动透传给弹窗遮罩下的页面（M-07） */
  overscroll-behavior: contain;
}

.dict-form {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dict-form :deep(.t-input) {
  flex: 1;
}

.dict-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.dict-label {
  font-weight: 600;
}

.dict-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
