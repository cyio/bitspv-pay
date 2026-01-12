import { ref } from 'vue';
import { useI18n } from 'vue-i18n'; // 导入 useI18n
import { PublicKey } from '@bsv/sdk'; // 导入 PublicKey
import { fetchAddressTransactions } from '../utils/api'; // 导入获取地址交易历史的函数
import { fetchTransactionDetailsBatch } from '../utils/api'; // 导入批量获取交易详情的函数
import { formatSingleTransaction } from '../utils/history'; // 导入新的格式化函数
import { useStorage } from './useStorage'; // 导入 useStorage 组合式函数

const TRANSACTIONS_PER_PAGE = 3;
let rawTransactionCache = [];
let cachedAddress = null;

export function useTransactionHistory() {
  const transactions = ref([]);
  const isLoading = ref(false);
  const isLoadingMore = ref(false);
  const error = ref(null);
  const hasMore = ref(true); // 新增状态，指示是否还有更多交易
  const { t } = useI18n(); // 获取翻译函数
  const storage = useStorage(); // 获取 storage 实例

  /**
   * 获取并设置指定地址的交易历史。
   * @param {string} address - 要查询的地址。
   * @param {number} limit - 每次加载的交易数量。
   * @param {number} offset - 从哪条交易开始加载。
   * @param {boolean} append - 是否将新加载的交易追加到现有列表中。
   */
  const fetchTransactions = async (
    address,
    limit = TRANSACTIONS_PER_PAGE,
    offset = 0,
    append = false
  ) => {
    if (append) {
      isLoadingMore.value = true;
    } else {
      isLoading.value = true;
    }
    error.value = null;
    try {
      const pubKeyHex = storage.getPublicKey();
      const curAddress = storage.getWalletAddress();
      let currentPublicKey = null;
      if (pubKeyHex) {
        try {
          currentPublicKey = PublicKey.fromString(pubKeyHex);
        } catch (e) {
          console.error('Error parsing public key from storage:', e);
        }
      }

      if (!currentPublicKey) {
        console.warn('Current public key not available. Cannot fetch transaction history.');
        error.value = t('bsvPayment.statusMessages.errors.walletNotLoaded');
        return;
      }

      // On initial load (offset is 0) or address change, fetch the full list and cache it.
      if (offset === 0 || cachedAddress !== address) {
        const freshRawTransactions = await fetchAddressTransactions(address);
        rawTransactionCache = freshRawTransactions;
        cachedAddress = address;
      }

      const sortedRawTransactions = rawTransactionCache;

      // 根据 offset 和 limit 提取交易ID
      const txidsToFetch = sortedRawTransactions
        .slice(offset, offset + limit)
        .map(tx => tx.tx_hash);

      // 更新 hasMore 状态
      hasMore.value = offset + limit < sortedRawTransactions.length;

      if (txidsToFetch.length === 0) {
        if (!append) {
          transactions.value = [];
        }
        return;
      }

      const detailedTransactions = await fetchTransactionDetailsBatch(txidsToFetch);

      const detailedTxMap = new Map(detailedTransactions.map(tx => [tx.txid, tx]));

      const formattedNewTransactions = Array.from(detailedTxMap.values()).map(detail => {
        return formatSingleTransaction(detail, pubKeyHex, curAddress);
      });

      if (append) {
        transactions.value = [...transactions.value, ...formattedNewTransactions];
      } else {
        transactions.value = formattedNewTransactions;
      }
    } catch (err) {
      console.error('Failed to fetch transaction history:', err);
      error.value = err.message || t('bsvPayment.statusMessages.errors.transactionHistoryLoadFailed');
      if (!append) {
        transactions.value = [];
      }
    } finally {
      if (append) {
        isLoadingMore.value = false;
      } else {
        isLoading.value = false;
      }
    }
  };

  return {
    transactions,
    isLoading,
    isLoadingMore,
    error,
    hasMore, // 导出 hasMore 状态
    fetchTransactions,
  };
}
