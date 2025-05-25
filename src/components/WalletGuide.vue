<template>
  <Transition name="slide-fade">
    <div v-if="props.isVisible" class="wallet-notice">
      <div class="notice-container">
        <button
          @click="close"
          type="button"
          class="close flex justify-center items-center size-7 text-sm font-semibold rounded-full border border-transparent text-gray-800 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none dark:text-white dark:hover:bg-gray-700 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
          data-hs-overlay="#hs-vertically-centered-modal"
        >
          <span class="sr-only">{{ $t('wallet.close') }}</span>
          <svg
            class="flex-shrink-0 size-4"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
        <div class="notice-header">
          <h3>{{ $t('wallet.title') }}</h3>
          <p class="subtitle">{{ $t('wallet.subtitle') }}</p>
        </div>

        <div class="wallet-list">
          <a
            v-for="wallet in wallets"
            :key="wallet.name"
            :href="wallet.link"
            target="_blank"
            rel="noopener noreferrer"
            class="wallet-item"
          >
            <span class="wallet-icon" v-if="wallet.icon.startsWith('http')">
              <img :src="wallet.icon" />
            </span>
            <span class="wallet-icon" v-else>{{ wallet.icon }}</span>
            <div class="wallet-info">
              <strong>{{ $t(`wallet.wallets.${wallet.nameKey}.name`) }}</strong>
              <span>{{ $t(`wallet.wallets.${wallet.nameKey}.description`) }}</span>
            </div>
            <span class="arrow">→</span>
          </a>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  isVisible: Boolean,
});

const emit = defineEmits(['update:isVisible']);

function close() {
  emit('update:isVisible', false);
}

const wallets = [
  {
    nameKey: 'YoursWallet',
    name: 'Yours Wallet',
    icon: 'https://avatars.githubusercontent.com/u/159480043?s=48&v=4',
    description: 'A non-custodial and open-source wallet for BSV and 1Sat Ordinals',
    link: 'https://chromewebstore.google.com/detail/panda-wallet/mlbnicldlpdimbjdcncnklfempedeipj',
  },
];
</script>

<style scoped>
.wallet-notice {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.75);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.notice-container {
  background: white;
  border-radius: 16px;
  padding: 24px;
  width: 90%;
  max-width: 480px;
}

.notice-container .close {
  float: right;
}

.notice-header {
  text-align: center;
  margin-bottom: 24px;
}

.notice-header h3 {
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  color: #1a1a1a;
}

.subtitle {
  color: #666;
  margin: 8px 0 0;
}

.wallet-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wallet-item {
  display: flex;
  align-items: center;
  padding: 16px;
  border: 1px solid #eee;
  border-radius: 12px;
  text-decoration: none;
  color: inherit;
  transition: all 0.2s ease;
}

.wallet-item:hover {
  background: #f5f5f5;
  transform: translateY(-2px);
}

.wallet-icon {
  font-size: 24px;
  margin-right: 16px;
  width: 24px;
  height: 24px;
}

.wallet-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.wallet-info strong {
  font-size: 16px;
  color: #1a1a1a;
}

.wallet-info span {
  font-size: 14px;
  color: #666;
}

.arrow {
  font-size: 20px;
  color: #999;
}

/* 过渡动画 */
.slide-fade-enter-active {
  transition: all 0.3s ease;
}

.slide-fade-leave-active {
  transition: all 0.2s cubic-bezier(1, 0.5, 0.8, 1);
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(20px);
  opacity: 0;
}
</style>
