import { ref, onMounted } from 'vue';

export function useGoogleConnectivity() {
  const isGoogleReachable = ref(null); // null: 未检查, true: 可达, false: 不可达

  const checkConnectivity = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // x 秒超时
      // clients3.google.com/generate_204 是一个轻量级的端点，用于网络连接检查
      await fetch('https://clients3.google.com/generate_204', { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
      clearTimeout(timeoutId);
      isGoogleReachable.value = true;
      console.log('Google connectivity check (hook): Reachable');
    } catch (error) {
      isGoogleReachable.value = false;
      console.warn('Google connectivity check (hook): Unreachable or timed out', error);
    }
  };

  // 在 composable 被使用时自动执行一次检查
  // onMounted 会确保在组件挂载后执行，如果希望更早，可以直接调用，但 onMounted 更符合 "hook" 的行为
  onMounted(() => {
    checkConnectivity();
  });

  return {
    isGoogleReachable,
    checkGoogleConnectivity: checkConnectivity // 也可选择暴露此函数供手动调用
  };
}
