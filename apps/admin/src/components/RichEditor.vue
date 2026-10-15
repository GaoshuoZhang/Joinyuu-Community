<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Editor, Toolbar } from '@wangeditor/editor-for-vue'
import { DomEditor } from '@wangeditor/editor'
import type { IDomEditor, IEditorConfig, IToolbarConfig } from '@wangeditor/editor'
import '@wangeditor/editor/dist/css/style.css'
import { MessagePlugin } from 'tdesign-vue-next'
import { uploadAsset } from '@/api/assets'
import { normalizeEmptyHtml } from '@/utils/formSnapshot'

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
    /* 给编辑器工具栏浮层预留足够空间，默认最小高度 360px。 */
    minHeight: 360,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
}>()

const editorRef = shallowRef<IDomEditor>()
const rootRef = ref<HTMLElement>()
let observer: MutationObserver | undefined
const valueHtml = ref(props.modelValue)
const editorHeight = computed(() => Math.max(props.minHeight, 360))

/* 工具栏：默认全套（撤销重做/标题/加粗斜体下划线删除线/颜色/列表/对齐/行高/链接/图片/代码块/引用/分割线/清除格式/全屏） */
const toolbarConfig: Partial<IToolbarConfig> = {}

const editorConfig: Partial<IEditorConfig> = {
  placeholder: props.placeholder,
  // 异步挂载时不抢走弹窗首字段或用户正在编辑的其他控件的焦点。
  autoFocus: false,
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

function associateEditorControls() {
  const root = rootRef.value
  if (!root) return
  const editor = root.querySelector<HTMLElement>('[data-slate-editor]')
  if (editor) {
    editor.setAttribute('role', 'textbox')
    editor.setAttribute('aria-multiline', 'true')
  }
  const groupLabels: Record<string, string> = {
    'group-more-style': '更多文字格式', 'group-justify': '文字对齐',
    'group-indent': '段落缩进', 'group-image': '插入图片', 'group-video': '插入视频',
  }
  root.querySelectorAll<HTMLButtonElement>('.rich-toolbar button[data-menu-key]').forEach((button) => {
    const tooltip = button.dataset.tooltip?.split('\n')[0] ?? ''
    const label = groupLabels[button.dataset.menuKey ?? ''] ||
      (/^(ctrl|cmd|⌘)/i.test(tooltip) ? '' : tooltip) || button.textContent?.trim()
    if (label) button.setAttribute('aria-label', label)
  })
}

onMounted(() => {
  associateEditorControls()
  observer = new MutationObserver(associateEditorControls)
  if (rootRef.value) observer.observe(rootRef.value, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tooltip'] })
})

/* 本地输入 → 上抛；外部赋值（弹窗开合/编辑回显）→ 回灌编辑器 */
watch(valueHtml, (v) => {
  if (normalizeEmptyHtml(v) !== normalizeEmptyHtml(props.modelValue)) emit('update:modelValue', v)
})

watch(
  () => props.modelValue,
  (v) => {
    if (v !== valueHtml.value) valueHtml.value = v
  },
)

onBeforeUnmount(() => {
  observer?.disconnect()
  const editor = editorRef.value
  if (editor) {
    // 当前 wangEditor 在销毁时移除了 selectionchange 监听，但未取消其 100ms 尾调用。
    // 先取消已排队的回调，避免关闭编辑弹窗后访问已移除的 editor 实例。
    const textarea = DomEditor.getTextarea(editor) as unknown as { onDOMSelectionChange?: { cancel?: () => void } }
    textarea.onDOMSelectionChange?.cancel?.()
    editor.destroy()
  }
})
</script>

<template>
  <div ref="rootRef" class="rich-editor" :style="{ '--editor-min-height': `${editorHeight}px` }">
    <Toolbar :editor="editorRef" :default-config="toolbarConfig" mode="default" class="rich-toolbar" />
    <Editor
      v-model="valueHtml"
      :default-config="editorConfig"
      mode="default"
      class="rich-body"
      :style="{ minHeight: `${editorHeight}px` }"
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

/* 让可编辑区域覆盖留白，避免只有首行能点击输入；内容增加时随外层弹窗滚动。 */
.rich-body :deep([data-slate-editor]) {
  min-height: var(--editor-min-height);
}
</style>
