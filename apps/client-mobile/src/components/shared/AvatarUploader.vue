<script setup lang="ts">
import { ref } from 'vue'
import { Avatar, Toast } from 'tdesign-mobile-vue'
import { uploadFile } from '@/api/uploads'
import { ApiError } from '@/api/http'

/* 点击头像/Logo 直接上传替换（隐藏 file input）；成功后 emit 新图片地址。
 * 个人头像（圆形）与企业 Logo（方形）共用。 */
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

const inputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

function pick() {
  inputRef.value?.click()
}

async function onChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    Toast('请选择图片文件')
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    Toast('图片不能超过 5MB')
    return
  }
  uploading.value = true
  try {
    const info = await uploadFile(file, props.bizType)
    emit('update:image', info.url)
    Toast('上传成功')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '上传失败，请重试')
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div
    class="avatar-uploader"
    :class="[`shape-${shape}`, { uploading }]"
    role="button"
    :aria-label="shape === 'round' ? '上传企业 Logo' : '更换头像'"
    @click="pick"
  >
    <Avatar :size="size" :shape="shape" :image="image" class="avatar-el">{{ fallback }}</Avatar>
    <span class="mask">{{ uploading ? '上传中…' : '更换' }}</span>
    <input ref="inputRef" class="file-input" type="file" accept="image/*" @change="onChange" />
  </div>
</template>

<style scoped>
.avatar-uploader {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  cursor: pointer;
  overflow: hidden;
}

.avatar-uploader.shape-circle {
  border-radius: var(--td-radius-circle);
}

.avatar-uploader.shape-round {
  border-radius: var(--td-radius-default);
}

.avatar-el {
  font-size: 20px;
  font-weight: 700;
}

.mask {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 1px 0 2px;
  text-align: center;
  font-size: 10px;
  line-height: 1.4;
  color: #fff;
  background: rgba(0, 0, 0, 0.4);
  pointer-events: none;
}

.avatar-uploader.uploading .mask {
  background: rgba(0, 0, 0, 0.55);
}

.file-input {
  display: none;
}
</style>
