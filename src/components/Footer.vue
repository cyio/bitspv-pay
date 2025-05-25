<template>
  <footer class="text-white py-4">
    <div class="container mx-auto text-center space-y-4">
      <div class="flex justify-center items-center space-x-4">
        <a
          :href="CONTACT_URL(locale)"
          target="_blank"
          class="text-blue-400 hover:underline"
        >
          {{ $t('footer.contactUs') }}
        </a>
        <button @click="openDonationModal" title="Buy me a coffee" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              xmlns="http://www.w3.org/2000/svg">
            <!-- 咖啡杯主体 -->
            <path d="M3 8h13v5a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8z"/>
            <!-- 杯子把手 -->
            <path d="M16 8h2a2 2 0 0 1 0 4h-2"/>
            <!-- 冒热气 -->
            <path d="M6 3c0 1 .5 1.5 .5 2s-.5 1-0.5 2"/>
            <path d="M10 3c0 1 .5 1.5 .5 2s-.5 1-0.5 2"/>
            <path d="M14 3c0 1 .5 1.5 .5 2s-.5 1-0.5 2"/>
          </svg>
        </button>
      </div>
      <div v-if="locale === 'zh'">
        <img src="@/assets/wx_gzh.webp" alt="WeChat QR Code" class="w-80 mx-auto" />
        <!-- <p class="mt-2">关注我们的微信公众号</p> -->
      </div>
    </div>
    <DonationModal :visible="isDonationModalVisible" @close="closeDonationModal" />
  </footer>
</template>

<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import DonationModal from './DonationModal.vue';
import { CONTACT_URL } from '@/utils/constants';

const { locale, t } = useI18n();
const isDonationModalVisible = ref(false);

const openDonationModal = () => {
  isDonationModalVisible.value = true;
};

const closeDonationModal = () => {
  isDonationModalVisible.value = false;
};
</script>

<style scoped></style>
