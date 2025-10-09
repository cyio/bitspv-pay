<template>
  <Modal :visible="visible" :title="$t('paymentAbout.title')" @close="closeModal" :hide-footer="true">
    <div class="px-3 py-3 space-y-3">
      <p class="text-sm text-gray-600 dark:text-gray-300">
        {{ $t('paymentAbout.description') }}
      </p>

      <div>
        <h3 class="text-md font-semibold text-gray-700 dark:text-gray-200">{{ $t('paymentAbout.security.title') }}</h3>
        <div class="pl-4 mt-1 space-y-1 text-sm text-gray-500 dark:text-gray-400">
          <p>• {{ $t('paymentAbout.security.provider') }}</p>
          <p>• {{ $t('paymentAbout.security.browserEnvironment') }}</p>
        </div>
      </div>

      <div>
        <h3 class="text-md font-semibold text-gray-700 dark:text-gray-200">{{ $t('paymentAbout.usage.title') }}</h3>
        <div class="pl-4 mt-1 space-y-1 text-sm text-gray-500 dark:text-gray-400">
          <p>• {{ $t('paymentAbout.usage.disposableAmount') }}</p>
          <p>• {{ $t('paymentAbout.usage.mobileRecommendation') }}</p>
          <p>• {{ $t('paymentAbout.usage.desktopComparison') }}</p>
        </div>
      </div>

      <div>
        <h3 class="text-md font-semibold text-gray-700 dark:text-gray-200">{{ $t('paymentAbout.tools') }}</h3>
        <div class="pl-4 mt-1 space-y-1 text-sm text-gray-500 dark:text-gray-400">
          <p>
            <a href="https://cyio.github.io/bitspv-open/wallet-decrypt/" target="_blank" class="text-blue-500 hover:underline">
              {{ $t('paymentAbout.walletDecryptTool') }}
            </a>
          </p>
        </div>
      </div>

      <!-- <p class="mt-2 text-sm text-gray-500 dark:text-gray-300">
        <strong>{{ $t('paymentAbout.versionLabel') }}:</strong> 1.0.0
      </p> -->
      <!-- <p class="mt-2 text-sm text-gray-500 dark:text-gray-300">
        <strong>{{ $t('paymentAbout.tipLabel') }}:</strong> oakerx@handcash.io / oakerx@rockwallet.me
      </p> -->
    </div>
    <template #footer>
      <button
        @click="closeModal"
        class="px-4 py-2 bg-blue-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
      >
        {{ $t('paymentAbout.closeButton') }}
      </button>
    </template>
  </Modal>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue';
import Modal from './Modal.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  visible: {
    type: Boolean,
    required: true,
  },
});

const emit = defineEmits(['close']);

const closeModal = () => {
  emit('close');
};
</script>
