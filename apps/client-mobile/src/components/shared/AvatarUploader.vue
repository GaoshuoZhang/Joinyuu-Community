<script setup lang="ts">
import { computed, ref } from 'vue'
import { Avatar, Toast, Upload } from 'tdesign-mobile-vue'
import type { UploadFile } from 'tdesign-mobile-vue'
import { uploadFile } from '@/api/uploads'
import { ApiError } from '@/api/http'

/* 头像/Logo 上传：TDesign Upload 单图（addContent 插槽渲染头像触发区，requestMethod 走业务上传）。
 * 个人头像（圆形）与企业 Logo（方形）共用；成功后 emit 新图片地址。 */
const props = withDefaults(
  defineProps<{
    image?: string
    /** 无图片时展示的首字/占位 */
    fallback?: string
    size?: string
    /** TDesign Avatar 形状：circle 圆形 / round 圆角方形（企业 Logo） */
    shape?: 'circle' | 'round'
    /** 上传业务类型（avatar / enterprise-logo…） */
    bizType?: string
  }>(),
  { image: '', fallback: '', size: '56px', shape: 'circle', bizType: 'avatar' },
)

const emit = defineEmits<{ (e: 'update:image', url: string): void }>()

const files = ref<UploadFile[]>([])
const uploading = ref(false)

/* 图片加载失败兜底：TDesign Avatar 的 hideOnLoadFailed 会连加载成功态一起跳过图片渲染，
 * 故改用 onError 记下失败地址，让 Avatar 回退渲染默认插槽的首字/占位 */
const failedImage = ref('')
const avatarImage = computed(() => (props.image && props.image !== failedImage.value ? props.image : ''))
function onAvatarError() {
  failedImage.value = props.image
}

async function requestUpload(file: UploadFile | UploadFile[]) {
  const target = Array.isArray(file) ? file[0] : file
  const raw = target?.raw as File | undefined
  if (!raw) return { status: 'fail' as const, error: '文件读取失败，请重试', response: {} }
  uploading.value = true
  try {
    const info = await uploadFile(raw, props.bizType)
    emit('update:image', info.url)
    return { status: 'success' as const, response: { url: info.url } }
  } catch (e) {
    const message = e instanceof ApiError ? e.message : '上传失败，请重试'
    return { status: 'fail' as const, error: message, response: { error: message } }
  } finally {
    uploading.value = false
  }
}

function onFail(context: { response?: { error?: string } }) {
  files.value = []
  Toast(context.response?.error ?? '上传失败，请重试')
}

function onValidate(context: { type?: string }) {
  files.value = []
  if (context.type === 'FILE_OVER_SIZE_LIMIT') Toast('图片不能超过 5MB')
}

function clearFiles() {
  files.value = []
}

function updateFiles(value: UploadFile[]) {
  files.value = value
}
</script>

<template>
  <Upload
    class="avatar-uploader"
    theme="grid"
    accept="image/*"
    :max="1"
    :files="files"
    :size-limit="{ size: 5, unit: 'MB' }"
    :request-method="requestUpload"
    @update:files="updateFiles"
    @success="clearFiles"
    @fail="onFail"
    @validate="onValidate"
  >
    <template #addContent>
      <span class="avatar-trigger" :class="`shape-${shape}`" :style="{ '--avatar-size': size }" :aria-label="shape === 'round' ? '上传企业 Logo' : '更换头像'">
        <Avatar :size="size" :shape="shape" :image="avatarImage" class="avatar-el" :on-error="onAvatarError">{{ fallback }}</Avatar>
        <span class="mask">{{ uploading ? '上传中…' : '更换' }}</span>
      </span>
    </template>
  </Upload>
</template>

<style scoped>
.avatar-uploader {
  display: inline-block;
  width: auto;
  height: auto;
  padding: 0;
}

/* 单图上传：隐藏组件自带的文件项/进度，统一由头像触发区呈现（图片来自 props.image） */
.avatar-uploader :deep(.t-upload__item:not(.t-upload__item--add)),
.avatar-uploader :deep(.t-upload__progress) {
  display: none;
}

/* 加号占位块还原为头像尺寸：去掉默认 80×80 灰底方块 */
.avatar-uploader :deep(.t-upload__item--add) {
  width: auto;
  height: auto;
  min-width: 0;
  background: transparent;
  color: inherit;
}

.avatar-uploader :deep(.t-upload__add-icon) {
  position: static;
  transform: none;
  display: block;
  width: auto;
  height: auto;
  min-width: 0;
  border: 0;
  background: transparent;
}

.avatar-trigger {
  position: relative;
  display: inline-flex;
  width: var(--avatar-size, 56px);
  height: var(--avatar-size, 56px);
  flex-shrink: 0;
  overflow: hidden;
  border-radius: var(--td-radius-circle); /* typography-token-exempt: 紧随其后的 line-height 是行盒归一（inline-flex 收拢基线间隙），非文字排版且角色档无行高 0；升级复核角色档是否引入行高 0 档 */
  line-height: 0;
}

.avatar-trigger.shape-round {
  border-radius: var(--td-radius-default);
}

.avatar-el {
  width: 100%;
  height: 100%;
  font: var(--app-type-page-title);
}

.mask {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding:1px 0 var(--app-space-1);
  text-align: center;
  font: var(--app-type-caption);
  color: var(--td-text-color-anti);
  background: var(--td-mask-active);
  pointer-events: none;
}
</style>
