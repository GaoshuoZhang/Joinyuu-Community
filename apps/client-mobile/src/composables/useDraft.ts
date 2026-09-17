import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface DraftOptions {
  /** 关闭时（如修改重提场景）不写入草稿 */
  enabled?: () => boolean
  /** 内容为空时不写入草稿（避免打开表单即产生空草稿） */
  isEmpty?: () => boolean
}

/** 表单草稿：sessionStorage 自动保存（防抖 800ms）+ 恢复/放弃。
 * v38 修复：放弃后不再回写（finished 标记）；仅在有实际修改（dirty）且内容不同于基线时保存，
 * 避免「打开表单未输入」覆盖已有草稿；页面隐藏时落盘；恢复后以恢复内容为新基线。 */
export function useDraft<T>(key: string, source: () => T, apply: (value: T) => void, options: DraftOptions = {}) {
  const storageKey = `joinyuu_draft_${key}`
  const hasDraft = ref(false)
  const savedAt = ref('')
  const dirty = ref(false)
  let baseline = ''
  let timer: number | undefined
  let finished = false

  function enabled(): boolean {
    return options.enabled?.() ?? true
  }

  function serialize(): string {
    try {
      return JSON.stringify(source())
    } catch {
      return ''
    }
  }

  /** 以当前内容为基线（程序化回填后调用，避免把回填当成用户修改） */
  function rebase(): void {
    baseline = serialize()
    dirty.value = false
  }

  function read(): T | null {
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { value: T; at: string }
      savedAt.value = parsed.at
      return parsed.value
    } catch {
      return null
    }
  }

  function save(): void {
    if (finished || !dirty.value || !enabled() || options.isEmpty?.()) return
    const value = serialize()
    if (!value || value === baseline) return
    try {
      const at = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      sessionStorage.setItem(storageKey, JSON.stringify({ value: JSON.parse(value), at }))
      savedAt.value = at
      hasDraft.value = true
    } catch {
      /* 序列化失败或超出配额时静默（大图草稿只在内存中保留） */
    }
  }

  /** 挂载时探测已有草稿（不自动恢复，由用户选择） */
  function detect(): void {
    hasDraft.value = read() !== null
  }

  function restore(): void {
    const value = read()
    if (!value) {
      hasDraft.value = false
      return
    }
    apply(value)
    hasDraft.value = true
    rebase()
  }

  /** 用户明确放弃：清除并阻止后续回写（继续编辑会重新开启自动保存） */
  function discard(): void {
    finished = true
    sessionStorage.removeItem(storageKey)
    hasDraft.value = false
    savedAt.value = ''
    dirty.value = false
  }

  /** 提交成功后清除 */
  function clear(): void {
    finished = true
    sessionStorage.removeItem(storageKey)
    hasDraft.value = false
    savedAt.value = ''
    dirty.value = false
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') save()
  }

  watch(source, () => {
    /* v43：程序化回填 / 内容仍为空时不算用户修改，避免「未填写也弹离开确认」 */
    if (serialize() === baseline || options.isEmpty?.()) return
    /* 用户再次修改：允许新的自动保存 */
    finished = false
    dirty.value = true
    window.clearTimeout(timer)
    timer = window.setTimeout(save, 800)
  }, { deep: true })

  onMounted(() => {
    rebase()
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onBeforeUnmount(() => {
    window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    save()
  })

  return { hasDraft, savedAt, dirty, detect, restore, discard, clear, rebase }
}
