import { useStorage } from '@vueuse/core';
import { useRoute } from 'vue-router';

/**
 * 用于判断功能模块是否启用
 * @param {string} featureName - 功能名称，用于 query 和 storage
 * @returns {Ref<boolean>} - 是否启用该功能
 */
export function useFeatureEnable(featureName) {
  const route = useRoute();

  // 通过 featureName 从 localStorage 获取该功能的显示状态，默认为 false
  const featureEnabled = useStorage(featureName, false);

  // 如果 URL 中包含 query 参数 featureName=1，则启用该功能并更新 storage
  const queryValue = route.query[featureName];
  if (queryValue !== undefined) {
    featureEnabled.value = queryValue === '1'; // 如果值是 '1'，则启用；否则禁用
  }

  return featureEnabled;
}
