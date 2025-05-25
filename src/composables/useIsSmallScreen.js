import { computed } from 'vue';
import { useWindowSize } from '@vueuse/core';

/**
 * 自定义 Hook，用于判断是否为小屏幕
 * @param {number} breakpoint - 触发小屏幕的宽度（默认 768px）
 * @returns {Ref<boolean>} - 是否为小屏幕
 */
export function useIsSmallScreen(breakpoint = 768) {
  try {
    const { width } = useWindowSize();

    // 根据传入的 breakpoint 判断是否为小屏幕
    const isSmallScreen = computed(() => width.value < breakpoint);
  
    return isSmallScreen;
  } catch (e) {
    return computed(() => false)
  }
}
