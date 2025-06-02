<template>
  <Modal
    :visible="visible"
    :title="title"
    modalClass="w-full max-w-sm"
    :hideFooter="false"
    :hideHeaderCloseButton="hideHeaderCloseButton"
    @close="handleCancel"
  >
    <div class="py-3">
      <div v-for="(input, index) in inputs" :key="input.id" :class="{ 'mt-4': index > 0 }">
        <p class="text-sm text-gray-700 dark:text-gray-300 py-2">{{ input.label }}</p>
        <input
          v-if="input.type === 'password'"
          :type="input.type || 'text'"
          v-model="localInputValues[input.id]"
          :placeholder="input.placeholder || ''"
          :maxlength="input.maxLength"
          class="mt-2 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          @keyup.enter="handleConfirm"
        />
        <input
          v-else
          :type="input.type || 'text'"
          v-model="localInputValues[input.id]"
          :placeholder="input.placeholder || ''"
          :maxlength="input.maxLength"
          class="mt-2 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
        <p v-if="input.hintMessage" class="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-2">{{ input.hintMessage }}</p>
        <p v-if="input.required && !localInputValues[input.id] && showValidationError" class="text-xs text-red-500 mt-1">
          {{ $t('dialog.requiredField') }}
        </p>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end space-x-3 pt-3">
        <button
          v-if="showCancelButton"
          type="button"
          class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
          @click="handleCancel"
        >
          {{ cancelButtonText }}
        </button>
        <button
          type="button"
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          @click="handleConfirm"
        >
          {{ confirmButtonText }}
        </button>
      </div>
    </template>
  </Modal>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue';
import Modal from '@/components/Modal.vue';
import i18n from '@/i18n'; // 导入主应用的 i18n 实例

const props = defineProps({
  title: {
    type: String,
    default: () => i18n.global.t('dialog.pleaseInput'),
  },
  inputs: {
    type: Array,
    required: true,
    default: () => [],
  },
  confirmButtonText: {
    type: String,
    default: () => i18n.global.t('dialog.confirm'),
  },
  cancelButtonText: {
    type: String,
    default: () => i18n.global.t('dialog.cancel'),
  },
  showCancelButton: {
    type: Boolean,
    default: true,
  },
  hideHeaderCloseButton: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['confirm', 'cancel']);

const visible = ref(false);
const localInputValues = reactive({});
const showValidationError = ref(false); // 控制是否显示验证错误信息

onMounted(() => {
  // 初始化本地输入值，并设置默认值
  props.inputs.forEach(input => {
    localInputValues[input.id] = input.defaultValue !== undefined ? input.defaultValue : '';
  });
  visible.value = true;

  // 自动聚焦第一个输入框
  setTimeout(() => {
    const firstInput = document.querySelector('.multi-input-prompt-modal input');
    if (firstInput) {
      firstInput.focus();
    }
  }, 100);
});

const handleConfirm = () => {
  showValidationError.value = true; // 尝试确认时显示验证错误

  // 检查必填字段
  const allRequiredFieldsFilled = props.inputs.every(input => {
    return !input.required || (localInputValues[input.id] !== null && localInputValues[input.id] !== undefined && localInputValues[input.id] !== '');
  });

  if (!allRequiredFieldsFilled) {
    // 如果有必填字段为空，不发出 confirm 事件
    return;
  }

  visible.value = false;
  emit('confirm', { ...localInputValues });
};

const handleCancel = () => {
  visible.value = false;
  emit('cancel');
};

// 监听 visible 变化，当 Modal 关闭时清理 DOM
watch(visible, (newVal) => {
  if (!newVal) {
    // 确保在动画结束后执行清理
    setTimeout(() => {
      // 这里通常由外部的 showMultiInputPrompt 函数负责 unmount
      // 组件本身不直接 unmount 宿主元素
    }, 50);
  }
});
</script>

<style scoped>
/* 可以添加一些组件特有的样式 */
</style>
