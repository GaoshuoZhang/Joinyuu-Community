<script setup lang="ts">
import { ref, watch } from 'vue'
import { MessagePlugin, type UploadFile } from 'tdesign-vue-next'
import { uploadAsset } from '@/api/assets'

/* 单图上传字段（企业名片 Logo / 用户头像共用）：选择图片即上传素材库并回填 URL，
 * 组件内以图片卡片呈现（预览/删除），删除即回填空串（消费方回退默认占位）。
 * 上传走素材库管道：魔数嗅探（拒绝 SVG/伪造类型）+ 系统配置 uploadMaxSizeMb 上限。 */
const props = withDefaults(
  defineProps<{
    modelValue?: string
    /** 素材库业务分类（bizType）：enterprise-logo / avatar */
    bizType: string
    /** 卡片下方提示文案 */
    tip?: string
    disabled?: boolean
  }>(),
  { modelValue: '', tip: '', disabled: false },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
}>()

/* t-upload 受控列表：由 modelValue 派生（有 URL 即一张已上传图片）。
 * 注意：t-upload 的受控入口是 modelValue（内部 useVModel 只识别 modelValue/files），
 * 传 value 会被忽略，导致已有图片无法回显。 */
const files = ref<UploadFile[]>([])

watch(
  () => props.modelValue,
  (v) => {
    if (!v) {
      if (files.value.length) files.value = []
      return
    }
    if (files.value[0]?.url !== v) files.value = [{ url: v, name: 'image', status: 'success' }]
  },
  { immediate: true, flush: 'post' },
)

/** 自定义上传：返回素材 URL 作为卡片预览地址（失败原因经 onFail 提示） */
async function requestMethod(
  file: UploadFile | UploadFile[],
): Promise<{ status: 'success' | 'fail'; error?: string; response?: { url: string } }> {
  const target = Array.isArray(file) ? file[0] : file
  const raw = target?.raw
  if (!(raw instanceof File)) return { status: 'fail', error: '未获取到文件' }
  try {
    const asset = await uploadAsset(raw, props.bizType)
    return { status: 'success', response: { url: asset.url } }
  } catch (e) {
    return { status: 'fail', error: e instanceof Error ? e.message : '图片上传失败' }
  }
}

/* 列表变化（新增/上传成功/删除）统一回填：成功项的 url 即最终值，无成功项即空串 */
function onChange(value: UploadFile[]) {
  files.value = value
  const uploaded = value.find((f) => f.status === 'success' && f.url)
  emit('update:modelValue', uploaded?.url ?? '')
}

function onFail({ file }: { file?: UploadFile }) {
  const response = file?.response as { error?: string } | undefined
  MessagePlugin.error(response?.error ?? '图片上传失败')
}
</script>

<template>
  <t-upload
    theme="image"
    accept="image/*"
    :model-value="files"
    :tips="tip"
    :disabled="disabled"
    :request-method="requestMethod"
    @change="onChange"
    @fail="onFail"
  />
</template>