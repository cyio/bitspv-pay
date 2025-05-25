<template>
  <Modal :visible="visible" :title="title" @close="closeModal" :modalClass="modalSizeClass" :hideFooter="true">
    <div class="p-4 space-y-4">
      <p class="text-sm text-gray-700 dark:text-gray-300 text-center">{{ $t('donationModal.message') }}</p>

      <div class="text-center">
        <div class="mb-2">
          <span class="font-semibold text-gray-600">{{ currentPaymentMethod === 'handcash' ? 'HandCash' : 'RockWallet' }}:</span>
          <span class="ml-1 text-gray-600 dark:text-gray-400 break-all">{{ activeAddress }}</span>
        </div>
        <div v-if="activeQRCodeUrl" class="flex justify-center my-3">
          <img :src="activeQRCodeUrl" alt="QR Code" class="w-48 h-48 border border-gray-300 dark:border-gray-600 rounded" />
        </div>
        <div v-else class="flex justify-center items-center w-48 h-48 border border-gray-300 dark:border-gray-600 rounded mx-auto">
          <p class="text-gray-500">{{ $t('donationModal.qrLoading') }}</p>
        </div>
      </div>

      <div class="flex flex-col sm:flex-row justify-center items-center space-y-2 sm:space-y-0 sm:space-x-3">
        <button
          @click="copyToClipboard"
          type="button"
          class="w-full sm:w-auto inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm"
        >
          {{ $t(copyButtonText) }}
        </button>
        <button
          @click="togglePaymentMethod"
          type="button"
          class="w-full sm:w-auto inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none sm:text-sm"
        >
          {{ $t('donationModal.toggleButtonPrefix') }} {{ currentPaymentMethod === 'handcash' ? 'RockWallet' : 'HandCash' }}
        </button>
      </div>
       <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-center">
        <a :href="CONTACT_URL(locale)" target="_blank" rel="noopener noreferrer" class="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
          {{ $t('donationModal.supportLinkText') }}
        </a>
      </div>
    </div>
  </Modal>
</template>

<script>
import i18n from '@/i18n'; // 假设您的 i18n 实例导出路径是 @/i18n

export default {
  props: {
    visible: {
      type: Boolean,
      required: true,
    },
    title: {
      type: String,
      default: () => i18n.global.t('donationModal.title'), // Default title from i18n
    },
    modalSizeClass: { // Added for consistency with Modal.vue if specific sizing is needed
      type: String,
      default: 'w-11/12 md:w-1/2 lg:w-1/3 max-w-md', // Default to a max width for better appearance
    }
  }
}
</script>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import Modal from './Modal.vue';
import QRCode from 'qrcode';
import { useI18n } from 'vue-i18n';
import { CONTACT_URL } from '@/utils/constants';

const { t, locale } = useI18n();

const props = defineProps({
  visible: {
    type: Boolean,
    required: true,
  },
  title: {
    type: String,
    // default: () => t('donationModal.title'), // Default title from i18n // 已移至普通 script 块
  },
  modalSizeClass: { // Added for consistency with Modal.vue if specific sizing is needed
    type: String,
    // default: 'w-11/12 md:w-1/2 lg:w-1/3 max-w-md', // Default to a max width for better appearance // 已移至普通 script 块
  }
});

const emit = defineEmits(['close']);

const currentPaymentMethod = ref('handcash'); // 'handcash' or 'rockwallet'
const handcashAddress = 'oakerx@handcash.io';
const rockwalletAddress = 'oakerx@rockwallet.me';

const handcashQRCodeUrl = ref('');
const rockwalletQRCodeUrl = ref('');

const copyButtonText = ref('donationModal.copyButton'); // To manage "Copied!" state

const activeAddress = computed(() => {
  return currentPaymentMethod.value === 'handcash' ? handcashAddress : rockwalletAddress;
});

const activeQRCodeUrl = computed(() => {
  return currentPaymentMethod.value === 'handcash' ? handcashQRCodeUrl.value : rockwalletQRCodeUrl.value;
});

const generateQRCodes = async () => {
  try {
    if (!handcashQRCodeUrl.value) {
      handcashQRCodeUrl.value = await QRCode.toDataURL(handcashAddress, { errorCorrectionLevel: 'H', width: 256 });
    }
    if (!rockwalletQRCodeUrl.value) {
      rockwalletQRCodeUrl.value = await QRCode.toDataURL(rockwalletAddress, { errorCorrectionLevel: 'H', width: 256 });
    }
  } catch (err) {
    console.error('Failed to generate QR code:', err);
    // Potentially set an error message to display to the user
  }
};

const togglePaymentMethod = () => {
  currentPaymentMethod.value = currentPaymentMethod.value === 'handcash' ? 'rockwallet' : 'handcash';
};

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(activeAddress.value);
    copyButtonText.value = 'donationModal.copiedButton';
    setTimeout(() => {
      copyButtonText.value = 'donationModal.copyButton';
    }, 2000); // Reset text after 2 seconds
  } catch (err) {
    console.error('Failed to copy text: ', err);
    // Handle error (e.g., show a notification to the user)
    alert(t('donationModal.copyError'));
  }
};

const closeModal = () => {
  emit('close');
};

watch(() => props.visible, (newVal) => {
  if (newVal) {
    // Generate QR codes when modal becomes visible if not already generated
    // This ensures QR codes are ready when the modal is shown for the first time
    // or if they failed to generate on mount for some reason.
    if (!handcashQRCodeUrl.value || !rockwalletQRCodeUrl.value) {
        generateQRCodes();
    }
  }
}, { immediate: false }); // 'immediate: false' to run only when `visible` changes from false to true

onMounted(() => {
  // Pre-generate QR codes if the component might be shown immediately
  // or to have them ready. If `visible` is initially true, this will run.
  // If `visible` is initially false, the watch effect will handle it upon becoming true.
  if (props.visible) {
    generateQRCodes();
  }
});

</script>

<style scoped>
/* Add any specific styles for DonationModal if needed */
</style>
