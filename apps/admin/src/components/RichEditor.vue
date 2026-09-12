<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { Editor, Toolbar } from '@wangeditor/editor-for-vue'
import type { IDomEditor, IEditorConfig, IToolbarConfig } from '@wangeditor/editor'
import '@wangeditor/editor/dist/css/style.css'
import { MessagePlugin } from 'tdesign-vue-next'
import { uploadAsset } from '@/api/assets'

/* 富文本编辑器（wangEditor v5）：
 * v-model 为 HTML；图片插槽走素材上传（uploadAsset，返回真实 URL）；
 * 后端写入统一 sanitize（客户端提交内容同样以白名单清洗后再落库）。
 * 对外 API 与旧轻量实现一致：modelValue / placeholder / minHeight。 */

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    minHeight?: number
  }>(),
  {
    modelValue: '',
    placeholder: '请输入内容…',
    /* 低于 300px 会触发 wangEditor「编辑区域高度 < 300px」告警且 modal hoverbar 定位异常，默认抬到 320 */
    minHeight: 320,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
}>()

const editorRef = shallowRef<IDomEditor>()
const valueHtml = ref(props.modelValue)
const editorHeight = computed(() => Math.max(props.minHeight, 360))

/* 工具栏：默认全套（撤销重做/标题/加粗斜体下划线删除线/颜色/列表/对齐/行高/链接/图片/代码块/引用/分割线/清除格式/全屏） */
const toolbarConfig: Partial<IToolbarConfig> = {}

const editorConfig: Partial<IEditorConfig> = {
  placeholder: props.placeholder,
  MENU_CONF: {
    uploadImage: {
      /* 图片经素材库上传通道（返回对象存储 URL） */
      async customUpload(file: File, insertFn: (url: string, alt: string, href: string) => void) {
        try {
          const asset = await uploadAsset(file, 'general')
          insertFn(asset.url, asset.fileName, asset.url)
        } catch (e) {
          MessagePlugin.error(e instanceof Error ? e.message : '图片上传失败，请重试')
        }
      },
    },
  },
}

function handleCreated(editor: IDomEditor) {
  editorRef.value = editor
}

/* 本地输入 → 上抛；外部赋值（弹窗开合/编辑回显）→ 回灌编辑器 */
watch(valueHtml, (v) => {
  if (v !== props.modelValue) emit('update:modelValue', v)
})

watch(
  () => props.modelValue,
  (v) => {
    if (v !== valueHtml.value) valueHtml.value = v
  },
)

onBeforeUnmount(() => {
  editorRef.value?.destroy()
})
</script>

<template>
  <div class="rich-editor">
    <Toolbar :editor="editorRef" :default-config="toolbarConfig" mode="default" class="rich-toolbar" />
    <Editor
      v-model="valueHtml"
      :default-config="editorConfig"
      mode="default"
      class="rich-body"
      :style="{ height: `${editorHeight}px` }"
      @on-created="handleCreated"
    />
  </div>
</template>

<style scoped>
.rich-editor {
  overflow: hidden;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
}

.rich-toolbar {
  border-bottom: 1px solid var(--td-component-border);
}
</style>
