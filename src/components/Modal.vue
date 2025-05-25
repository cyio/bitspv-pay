<template>
  <div
    v-if="visible"
    class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex justify-center items-center z-50"
    @click.self="close"
  >
    <div :class="['relative p-5 border shadow-lg rounded-md bg-white dark:bg-gray-800', modalClass]">
      <div class="">
        <div class="flex justify-between items-center pb-3">
          <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">{{ title }}</h3>
          <button v-if="!hideHeaderCloseButton" @click="close" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
        <div class="mt-2">
          <slot></slot>
        </div>
        <div v-if="!hideFooter" class="items-center px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
          <slot name="footer">
            <button
              @click="close"
              type="button"
              class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              {{ closeButtonText || $t('modal.closeButton') }}
            </button>
          </slot>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  visible: {
    type: Boolean,
    required: true,
  },
  title: {
    type: String,
    default: '',
  },
  modalClass: {
    type: String,
    default: 'w-11/12 md:w-1/2 lg:w-1/3', // Default width classes
  },
  closeButtonText: {
    type: String,
    default: '',
  },
  hideFooter: {
    type: Boolean,
    default: false,
  },
  hideHeaderCloseButton: { // New prop to hide the header 'X' close button
    type: Boolean,
    default: false,
  }
});

const emit = defineEmits(['close']);

const close = () => {
  emit('close');
};
</script>

<style scoped>
/* Scoped styles for Modal.vue if any */
</style>
