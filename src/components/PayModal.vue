<template>
  <div
    id="hs-vertically-centered-modal"
    class="hs-overlay size-full fixed top-0 start-0 z-[80] overflow-x-hidden overflow-y-auto bg-black bg-opacity-50"
  >
    <div
      class="hs-overlay-open:mt-7 hs-overlay-open:opacity-100 hs-overlay-open:duration-500 mt-0 ease-out transition-all sm:max-w-lg sm:w-full m-3 sm:mx-auto min-h-[calc(100%-3.5rem)] flex items-center"
    >
      <div
        class="w-full flex flex-col bg-white border shadow-sm rounded-xl dark:bg-gray-800 dark:border-gray-700 dark:shadow-slate-700/[.7]"
      >
        <div class="flex justify-between items-center py-3 px-4 border-b dark:border-gray-700">
          <h3 class="font-bold text-gray-800 dark:text-white">How to continue</h3>
          <button
            @click="closeModal"
            type="button"
            class="flex justify-center items-center size-7 text-sm font-semibold rounded-full border border-transparent text-gray-800 hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none dark:text-white dark:hover:bg-gray-700 dark:focus:outline-none dark:focus:ring-1 dark:focus:ring-gray-600"
            data-hs-overlay="#hs-vertically-centered-modal"
          >
            <span class="sr-only">Close</span>
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
        </div>
        <div class="p-4 overflow-y-auto">
          <div class="flex flex-row justify-between items-center p-4">
            <div class="w-1/2">
              <p class="text-lg font-bold">Please install the Payment Chrome extension.</p>
              <p class="mb-4">
                Install the extension now to access the PayWall feature by making payments with
                BitcoinSV.
              </p>
              <a
                href="https://chromewebstore.google.com/detail/panda-wallet/mlbnicldlpdimbjdcncnklfempedeipj"
                target="_blank"
              >
                <button class="bg-blue-500 text-white py-2 px-4 rounded font-bold">
                  Install extension
                </button>
              </a>
            </div>
            <div class="w-1/2">
              <p class="text-lg font-bold">I don't want to pay for now.</p>
              <p class="">PayWall function will automatically continue when the countdown ends.</p>
              <p id="countdown" class="text-3xl font-bold text-red-500">
                {{ countDownTimeFormatted }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';

const emit = defineEmits(['close', 'continue']);

function closeModal() {
  emit('close');
}

const countDownTime = ref(1000 * 60 * 3); // 倒计时时间，单位：毫秒

function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const secondsLeft = seconds % 60;
  const formattedSeconds = secondsLeft < 10 ? `0${secondsLeft}` : secondsLeft;
  return `${minutes}:${formattedSeconds}`;
}

// 定义一个计时器
let timer = null;

// 在组件挂载时启动计时器
onMounted(() => {
  timer = setInterval(() => {
    if (countDownTime.value > 0) {
      countDownTime.value -= 1000; // 每秒减少 1000 毫秒
    } else {
      // 倒计时结束
      clearInterval(timer);
      // 执行指定操作
      emit('continue');
      emit('close');
    }
  }, 1000);
});

// 在组件卸载时清除计时器
onBeforeUnmount(() => {
  clearInterval(timer);
});

const countDownTimeFormatted = computed(() => {
  return formatTime(countDownTime.value);
});
</script>
<style>
@media (min-width: 640px) {
  .sm\:max-w-lg {
    max-width: 42rem;
  }
}
</style>
