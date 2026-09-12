import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 断点判定：≤767px 走移动壳与移动组件树（plan §3.4） */
export const useBreakpointStore = defineStore('breakpoint', () => {
  const mq = window.matchMedia('(max-width: 767px)')
  const isMobile = ref(mq.matches)
  mq.addEventListener('change', (e) => {
    isMobile.value = e.matches
  })
  return { isMobile }
})
