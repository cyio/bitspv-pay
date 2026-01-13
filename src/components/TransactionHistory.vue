<template>
  <div class="p-4">
    <div class="font-bold mb-4 text-gray-800 dark:text-gray-100">{{ $t('transactionHistory.smallTitle') }}</div>

    <div v-if="isLoading" class="flex justify-center items-center py-8">
      <div class="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      <p class="ml-3 text-gray-600 dark:text-gray-400">{{ $t('transactionHistory.loading') }}</p>
    </div>

    <div v-else-if="error" class="text-red-600 dark:text-red-400 text-center py-8">
      <p>{{ $t('transactionHistory.error') }}: {{ error.message }}</p>
    </div>

    <div v-else-if="transactions.length === 0" class="text-center text-gray-500 dark:text-gray-400 py-8">
      <p>{{ $t('transactionHistory.noRecords') }}</p>
    </div>

    <ul v-else class="space-y-3">
      <li
        v-for="tx in sortedTransactions"
        :key="tx.txid"
        class="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex-1 mb-2 sm:mb-0 flex flex-col">
          <div class="flex justify-between items-center mb-1">
            <span
              :class="{
                'text-green-600 dark:text-green-400': tx.type === 'income',
                'text-red-600 dark:text-red-400': tx.type === 'expense',
              }"
              class="font-bold text-lg"
            >
              {{ tx.type === 'income' ? '+' : '-' }}{{ tx.amount }}
            </span>
            <span class="text-sm text-gray-500 dark:text-gray-300">
              {{ tx.time ? formatDate(tx.time) : $t('transactionHistory.unconfirmed') }}
            </span>
          </div>
          <div class="text-xs text-gray-400 dark:text-gray-500 flex justify-end">
            <div>
              <!-- <span class="mr-1">{{ $t('transactionHistory.txid') }}:</span> -->
              <a
                :href="`https://whatsonchain.com/tx/${tx.txid}`"
                target="_blank"
                rel="noopener noreferrer"
                class="underline hover:text-blue-500 dark:hover:text-blue-300"
                :title="tx.txid"
              >
                {{ truncateTxid(tx.txid) }}
              </a>
              <button @click="copyTxid(tx.txid)" class="ml-1 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-xs">
                [{{ copyStatus[tx.txid] || $t('transactionHistory.copy') }}]
              </button>
            </div>
          </div>
        </div>
        <!-- 可以根据需要添加更多信息，例如相关地址 -->
        <!-- <div v-if="tx.relatedAddress" class="text-sm text-gray-500 dark:text-gray-400">
          {{ tx.type === 'receive' ? $t('transactionHistory.from') : $t('transactionHistory.to') }}: {{ truncate(tx.relatedAddress, 6, 6) }}
        </div> -->
      </li>
    </ul>

    <div v-if="sortedTransactions.length > 0 && hasMore" class="flex justify-center mt-4">
      <button
        v-if="!isLoadingMore"
        @click="loadMoreTransactions"
        :disabled="isLoadingMore"
        class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span >{{ $t('transactionHistory.loadMore') }}... </span>
      </button>
      <span v-else>
          <div
            class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2"
          ></div>
          {{ $t('transactionHistory.loading') }}
        </span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'; // 导入 onMounted
import { useI18n } from 'vue-i18n';
import { truncate } from '../utils/bsv';
import { showInfoDialog } from '../utils/confirm'; // 导入 showInfoDialog
import { useTransactionHistory } from '../composables/useTransactionHistory'; // 导入 useTransactionHistory
import { useWallet } from '../composables/useWallet'; // 导入 useWallet
import { useStorage } from '../composables/useStorage'; // 导入 useStorage

const { t } = useI18n();
const copyStatus = ref({}); // 用于管理每个 txid 的复制状态

const storage = useStorage(); // 获取 storage 实例
const address = ref(storage.getWalletAddress()); // 从 storage 获取钱包地址

const { transactions, isLoading, error, hasMore, fetchTransactions, isLoadingMore } =
  useTransactionHistory();

const currentOffset = ref(0);

const sortedTransactions = computed(() => {
  // 确保 transactions 是一个 ref 对象且其 value 存在且是数组，以避免在初始加载时出现 undefined 错误
  return [...((transactions && transactions.value) || [])].sort((a, b) => b.timestamp - a.timestamp);
});

const formatDate = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleString(); // 根据用户本地设置格式化日期和时间
};

const truncateTxid = (txid) => {
  return truncate(txid, 6, 6); // 截断 txid，例如 123456...abcdef
};

const copyTxid = async (txid) => {
  try {
    await navigator.clipboard.writeText(txid);
    copyStatus.value[txid] = t('transactionHistory.copied');
    setTimeout(() => {
      copyStatus.value[txid] = t('transactionHistory.copy');
    }, 1000);
  } catch (err) {
    console.error('Failed to copy txid:', err);
    showInfoDialog(t('transactionHistory.copyFailedTitle'), t('transactionHistory.copyFailedMessage'));
  }
};

const loadMoreTransactions = async () => {
  // TRANSACTIONS_PER_PAGE is 3, defined in the composable.
  currentOffset.value += 3;
  await fetchTransactions(address.value, undefined, currentOffset.value, true); // 追加加载
};

onMounted(() => {
  if (address.value) {
    currentOffset.value = 0;
    fetchTransactions(address.value, undefined, currentOffset.value, false); // 初始加载
  }
});
</script>

<style scoped>
/* 可以添加一些 Tailwind CSS 之外的自定义样式 */
</style>
