<template>
  <div class="min-h-screen py-8">
    <!-- 顶部提示信息 -->
    <div v-if="showOldWalletWarning" class="bg-yellow-100 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200 px-4 py-3 rounded-lg relative mb-4 max-w-md mx-auto text-sm">
      {{ $t('bsvPayment.statusMessages.oldWalletWarning') }} <a href="https://www.bitspv.com/pay.html" target="_blank" class="text-yellow-800 dark:text-yellow-200 underline hover:text-yellow-900 dark:hover:text-yellow-100">旧网址</a>
      <button @click="closeOldWalletWarning" class="absolute top-1 right-2 text-yellow-800 dark:text-yellow-200 hover:text-yellow-900 dark:hover:text-yellow-100 text-lg font-bold">&times;</button>
    </div>
    <div class="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 relative">
      <div class="absolute top-4 right-4 flex items-center space-x-2">
        <button @click="showAboutModal = true" title="About" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <AboutIcon />
        </button>
        <button v-if="!sendRequest" @click="openDonationModal" title="Buy me a coffee" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <!-- <SparklesIcon class="w-6 h-6" /> -->
          <CoffeeIcon />
        </button>
        <!-- 交易历史按钮 -->
        <button @click="openHistoryModal" title="交易历史" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>
      <h1 class="text-2xl font-bold text-center">{{ $t('bsvPayment.title') }}</h1>
      <p class="text-sm text-center text-gray-500 mb-4">{{ $t('bsvPayment.statusMessages.notSafeForStorage') }}</p>

      <!-- 状态显示 -->
      <div class="mb-2" v-show="sendRequest">
        <!-- 支付金额信息 (放在更显著位置) -->
        <div v-if="sendRequest && isAmountCalculated" class="mb-2 p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <div class="text-center text-gray-800 dark:text-gray-100">
            <div class="text-lg font-bold">{{ $t('bsvPayment.totalAmountLabel') }}: {{ convertSatoshisToBSV(minCost) }} BSV</div>
            <div v-if="minCost > balance" class="mt-2 text-red-600 dark:text-red-400">
              {{ $t('bsvPayment.supplementAmountLabel', { amount: convertSatoshisToBSV(minCost - balance) }) }}
            </div>
          </div>
        </div>
        
        <!-- 状态信息 (作为附属信息) -->
        <div
          class="text-center text-sm mt-1"
          :class="statusClasses"
        >
          <p>
            {{ statusMessage || $t('bsvPayment.statusMessages.waitingPay') }}
          </p>
        </div>
      </div>
      <div class="h-6 w-full flex justify-center" v-show="sendRequest && ['waiting', 'processing'].includes(status)">
        <div class="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <!-- <div class="animate-spin rounded-full h-6 w-6 border-t-4 border-blue-500 border-solid"></div> -->
      </div>
      <!-- 钱包名称显示 -->
      <div v-if="walletName" class="text-center text-gray-600 dark:text-gray-300">
        <span class="text-sm"><span class="font-semibold">{{ walletName }}</span></span>
      </div>

      <!-- Wallet Dependent UI -->
      <template v-if="isWalletUiVisible">
        <!-- 二维码显示 -->
        <div v-if="qrcode" class="mt-2 mb-4">
          <div class="flex justify-center">
            <img :src="qrcode" :alt="$t('bsvPayment.qrCode')" class="w-48 h-48" />
          </div>
        </div>

        <!-- 地址显示和复制 -->
        <div class="mb-6">
          <div class="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-950 rounded">
            <div class="flex-1 font-mono text-sm truncate">
              {{ address }}
            </div>
            <button
              @click="copyAddress"
              class="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              {{ copyBtnText }}
            </button>
          </div>
        </div>
      <!-- 余额显示 -->
      <div class="text-center text-gray-600 dark:text-gray-300 mb-4 flex items-center justify-center space-x-2">
        <span>{{ $t('bsvPayment.balanceLabel') }}: <span class="font-semibold">{{ convertSatoshisToBSV(balance) }}</span> BSV</span>
        <button @click="refreshBalance" :disabled="isRefreshingBalance" class="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300" :title="$t('bsvPayment.refreshBalanceButton')">
          <RefreshIcon :is-refreshing="isRefreshingBalance" />
        </button>
      </div>

        <!-- 钱包管理按钮 -->
        <button
            @click="openPaymentPage"
            class="w-full px-4 py-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
            v-if="sendRequest && !showWalletManager"
          >
          <span>{{ $t('bsvPayment.manageWalletButton') }}</span>
        </button>
        <WalletManager
          v-show="!sendRequest || showWalletManager"
          ref="walletManager"
          :address="address"
          :max-transfer-amount-value="maxTransferAmountForManager"
          :get-wif-function="getWifForBackup"
          @transfer-funds="handleTransferFunds"
          @delete-wallet="handleDeleteWallet"
          @request-calculate-max-transfer="handleRequestCalculateMaxTransfer"
          @request-import-wallet="triggerImportWallet"
        />
      </template>
      <!-- End Wallet Dependent UI -->
      
      <!-- 钱包加载状态 -->
      <div v-show="!isWalletUiVisible" class="flex flex-col items-center justify-center py-8">
        <div class="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p class="text-gray-600 dark:text-gray-400">{{ $t('bsvPayment.statusMessages.walletLoading') }}</p>
      </div>
    </div>
    <PaymentAbout :visible="showAboutModal" @close="showAboutModal = false" />
    <DonationModal :visible="isDonationModalVisible" @close="closeDonationModal" />

    <!-- 交易历史模态框 -->
    <Modal :visible="showHistoryModal" @close="showHistoryModal = false" :title="$t('transactionHistory.title')" :hideFooter="true">
      <div class="max-h-96 overflow-y-auto">
        <TransactionHistory
          :transactions="transactions"
          :is-loading="isHistoryLoading"
          :error="historyError"
        />
      </div>
    </Modal>
  </div>
  <input type="file" ref="importFileInput" @change="handleFileImport" accept="image/*" style="display: none" />
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue';
const importFileInput = ref(null);
import { useGoogleConnectivity } from '../composables/useGoogleConnectivity';
import { useStorage } from '../composables/useStorage';
import { useWallet } from '../composables/useWallet'; // 导入 useWallet
const OLD_WALLET_WARNING_CLOSED_KEY = 'oldWalletWarningClosed'; // 定义 localStorage key
import { P2PKH, Script, Transaction, SatoshisPerKilobyte, PrivateKey } from '@bsv/sdk'; // 移除 PrivateKey, PublicKey, BigNumber
import { PaymailClient } from '@cyio/ts-paymail/client';
import jsQR from 'jsqr';
import PaymentAbout from '../components/PaymentAbout.vue';
import DonationModal from '../components/DonationModal.vue';
import AboutIcon from '../components/AboutIcon.vue'; // 导入 AboutIcon
import CoffeeIcon from '../components/CoffeeIcon.vue'; // 导入 CoffeeIcon
import RefreshIcon from '../components/RefreshIcon.vue'; // 导入 RefreshIcon
import { SparklesIcon } from '@heroicons/vue/24/outline';
import { useDocumentVisibility } from '@vueuse/core';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { MOCK_DRY_RUN_WIF } from '../utils/constants';
import {
  broadcastTransaction,
  broadcastTransactionWithBitails,
  getSenderAddress,
  getSourceTransaction,
  getSourceAddressFromTx,
  getSourceTransaction2,
  getSourceTransaction3,
  convertSatoshisToBSV,
  getUTXOs,
  isValidAddress,
  truncate,
  isValidPaymail, // 导入 isValidPaymail
} from '../utils/bsv';
import { showInfoDialog, showPromptDialog, showConfirmationDialog } from '../utils/confirm'; // 导入 showInfoDialog, showPromptDialog, showConfirmationDialog
import WalletManager from '../components/WalletManager.vue';
import { getBalance } from '../utils/bsv'; // 导入 getBalance 函数
import Modal from '../components/Modal.vue'; // 导入 Modal 组件
import TransactionHistory from '../components/TransactionHistory.vue'; // 导入 TransactionHistory 组件
import { useTransactionHistory } from '../composables/useTransactionHistory'; // 导入 useTransactionHistory composable

const route = useRoute();
const { t, locale } = useI18n();
const DEFAULT_MIN_COST = 10
const sourceTxCache = new Map(); // Cache for source transactions

const walletManager = ref(null);

// 使用 useWallet composable，并传入 t
const { pubKey, address, qrcode, walletName, isWalletUiVisible, createWallet, getWifForBackup, handleDeleteWallet, handleImportData, handleRequestImportWallet, ensurePrivateKeyLoaded, setWalletName } = useWallet(t);

// 使用 useTransactionHistory composable
const { transactions, isLoading: isHistoryLoading, error: historyError } = useTransactionHistory();

// 计算属性：根据状态返回相应的 Tailwind CSS 类
const statusClasses = computed(() => {
  switch (status.value) {
    case 'waiting':
      return 'text-gray-600 dark:text-gray-400';
    case 'received':
      return 'text-green-600 dark:text-green-300';
    case 'processing':
      return 'text-blue-600 dark:text-blue-300';
    case 'completed':
      return 'text-green-600 dark:text-green-300';
    case 'error':
      return 'text-red-600 dark:text-red-300';
    default:
      return '';
  }
});

// 处理文件导入 (包装 useWallet 里的 handleImportData)
const handleFileImport = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const imageData = e.target.result;
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      
      if (code) {
        const result = await handleImportData(code.data);
        if (result?.error && walletManager.value?.updateTransferStatus) {
          walletManager.value.updateTransferStatus('error', result.message);
        } else if (result?.walletName) {
          // 导入成功后，更新 Payment.vue 中的 walletName
          walletName.value = result.walletName;
        }
      } else {
        await showInfoDialog(
          t('bsvPayment.statusMessages.errorTitle'),
          t('bsvPayment.statusMessages.errors.invalidQrCode')
        );
      }
    };
    img.src = imageData;
  };
  reader.readAsDataURL(file);
  // 清空 input 的 value，确保再次选择相同文件时也能触发 change 事件
  event.target.value = '';
};

const isRefreshingBalance = ref(false); // 新增：控制余额刷新按钮的加载状态
const balance = ref(0);
const minCost = ref(DEFAULT_MIN_COST);
const status = ref('waiting'); // waiting, received, processing, completed, error
const statusMessage = ref('');
const checkInterval = ref(false);
const sourceAddress = ref(null);
const txid = ref(null);
const documentVisibility = useDocumentVisibility();
const sendRequest = ref(null);
const payMode = ref('');
const isDebug = 0;
const copyBtnText = ref(t('bsvPayment.copyButton'));
const maxTransferAmountForManager = ref(null); // 新增 ref
const showAboutModal = ref(false); // 控制关于弹层的显示
const isDonationModalVisible = ref(false);
const isAmountCalculated = ref(false); // 新增：表示金额是否计算完毕
const showWalletManager = ref(false); // 新增：控制 WalletManager 的显示
const showOldWalletWarning = ref(false); // 控制顶部提示信息的显示
const showHistoryModal = ref(false); // 控制历史交易记录模态框的显示

const storage = useStorage(); // 保持 useStorage 导入

const { isGoogleReachable } = useGoogleConnectivity(); // 使用 composable

const openDonationModal = () => {
  isDonationModalVisible.value = true;
};

const closeDonationModal = () => {
  isDonationModalVisible.value = false;
};

// 打开历史交易记录模态框并加载数据
const openHistoryModal = async () => {
  showHistoryModal.value = true;
};

const triggerImportWallet = () => {
  if (importFileInput.value) {
    handleRequestImportWallet(importFileInput.value);
  }
};

const openPaymentPage = () => {
  window.open('/pay.html', '_blank');
};



// 处理转账事件
const handleTransferFunds = async (receivedTarget, amount) => {
  const utxos = await getUTXOs(address.value); // 确保 utxos 被定义
  
  let paymentTargetObject = {};
  if (isValidPaymail(receivedTarget)) {
    paymentTargetObject.paymail = receivedTarget;
  } else if (isValidAddress(receivedTarget)) {
    paymentTargetObject.address = receivedTarget;
  } else {
    // 此处应由 WalletManager 拦截，但作为保险
    console.error('Invalid target received in Payment.vue:', receivedTarget);
    walletManager.value.updateTransferStatus('error', t('bsvPayment.statusMessages.errors.invalidReceivedTarget')); // 可能需要新的i18n
    return;
  }

  const transferRequest = [{
    ...paymentTargetObject,
    satoshis: amount, // 使用传入的金额
  }];

  const result = await processRefund(utxos, transferRequest, false);
  if (result?.error === 0) {
    // 转账成功后，重新计算余额和最大可转账金额
    const newBalance = await getBalance(address.value);
    balance.value = newBalance.total;
    const calculateMaxResult = await calculateMaxTransfer();
    if (calculateMaxResult && typeof calculateMaxResult.maxAmount === 'number') {
      maxTransferAmountForManager.value = calculateMaxResult.maxAmount;
    }
    walletManager.value.updateTransferStatus('completed', t('bsvPayment.statusMessages.clearWallet.success', { txid: result.txid }));
  } else {
    console.error('Error transferring funds: ', result);
    walletManager.value.updateTransferStatus('error', t('bsvPayment.statusMessages.clearWallet.error') + ` ${result.error}`);
  }
};

// 移除 handleCopyPrivateKey 函数，因为它已迁移到 useWallet 或由 WalletManager 处理
const handleCopyPrivateKey = async () => {
  console.warn('handleCopyPrivateKey is deprecated in Payment.vue. Use WalletManager for private key operations.');
  await showInfoDialog(t('bsvPayment.statusMessages.errorTitle'), t('bsvPayment.statusMessages.errors.deprecatedFunction'));
  return false;
};



const dumpUTXO = [
  {
    txid: 'a22cd88ea858528f149008c61d12eb33405587bba7709a7d67a50e0a50f32460',  // 示例交易ID
    vout: 0,  // 输出索引
    satoshis: 0,  // 50000聪
    script: '76a914c8ae4abfb0974c21dee05f58544ff574587f2a7c88ac'
    // address: 'your_bitcoin_address_here',
  }
];

// 新增函数：处理支付请求
const handlePaymentRequest = async () => {
  console.log('begin handlePaymentRequest');
  if (!sendRequest.value) {
    // 尝试从 URL 哈希中读取支付参数
    const hash = window.location.hash.substring(1); // 获取哈希值并移除 '#'
    const { dryrun, mode } = route.query; // 保留对 query 中其他参数的读取
    console.log('URL hash:', hash);
    console.log('URL query params:', route.query);

    if (dryrun === '1') {
      return;
    }
    payMode.value = mode; // 注意这里之前是 payMode.value - mode，修正为赋值

    if (hash) {
      try {
        const decodedHash = decodeURIComponent(hash);
        const params = JSON.parse(decodedHash);
        if (params && params.length > 0) {
          sendRequest.value = params;
        } else {
           console.warn('Parsed params from hash is empty or invalid:', params);
        }
      } catch (e) {
        console.error('Failed to parse params from URL hash:', e);
        status.value = 'error';
        statusMessage.value = t('bsvPayment.statusMessages.invalidRequest');
      }
    } else {
      //  console.warn('No hash found in URL for payment parameters.');
       // 根据业务逻辑决定是否需要报错或显示提示
       // status.value = 'error';
       // statusMessage.value = t('bsvPayment.statusMessages.missingParams');
    }
    console.log('sendRequest from hash:', hash, sendRequest.value);
  }

  // 带参数访问
  if (sendRequest.value) {
    checkBalance();
  } else {
    // 直接访问，兜底
    refreshBalance()
  }
};

// 复制地址到剪贴板
const copyAddress = async () => {
  const preText = copyBtnText.value
  try {
    await navigator.clipboard.writeText(address.value);
    copyBtnText.value = t('bsvPayment.statusMessages.addressCopied');
  } catch (error) {
    console.error('Failed to copy address:', error);
    copyBtnText.value = t('bsvPayment.statusMessages.copyFailed');
  }
  setTimeout(() => {
    copyBtnText.value = preText;
  }, 1000);
};

// 处理子组件请求计算最大转账金额的事件
const handleRequestCalculateMaxTransfer = async () => {
  // ensurePrivateKeyLoaded will be called within calculateMaxTransfer if needed by processRefund
  const result = await calculateMaxTransfer();
  if (result && typeof result.maxAmount === 'number') {
    maxTransferAmountForManager.value = result.maxAmount;
  } else {
    maxTransferAmountForManager.value = 0; // 或者设置为 null，根据组件预期
  }
  // 可以选择性地将 message 返回或处理
  return result; // 返回给子组件，如果它需要处理消息
};

// 计算最大可转出金额
const calculateMaxTransfer = async () => {
  // No need to explicitly call ensurePrivateKeyLoaded here if processRefund handles it.
  // For now, processRefund's call is sufficient.
  try {
    const utxos = await getUTXOs(address.value);
    const currentBalance = utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0);

    if (currentBalance <= 0) {
      return {
        maxAmount: 0,
        message: t('bsvPayment.statusMessages.balanceStatus.zeroBalance')
      };
    }

    // 模拟发送全部余额到一个临时地址以估算费用
    const tempTargetAddress = address.value; // 使用自己的地址作为临时目标

    const dryRunRequest = [{
      address: tempTargetAddress,
      satoshis: currentBalance - 10, // 尝试发送余额-10sat，确保有足够手续费空间
    }];

    console.log('Calculating max transfer amount (dry run)...');
    const dryRunResult = await processRefund(utxos, dryRunRequest, true);

    if (dryRunResult.error === 0) {
      const estimatedFee = dryRunResult.requiredFee || 0;
      const calculatedMax = currentBalance - estimatedFee;
      const maxAmount = calculatedMax > 0 ? calculatedMax : 0;
      console.log(`Calculation successful. Balance: ${currentBalance}, Estimated Fee: ${estimatedFee}, Max Transferable: ${maxAmount}`);
      
      return {
        maxAmount,
        message: maxAmount <= 0 ? t('bsvPayment.statusMessages.balanceStatus.insufficientForFee') : ''
      };
    } else if (dryRunResult.error === 'insufficient-funds') {
      return {
        maxAmount: 0,
        message: t('bsvPayment.statusMessages.balanceStatus.insufficientForFee')
      };
    } else {
      return {
        maxAmount: 0,
        message: `${t('bsvPayment.statusMessages.feeCalculationFailed')}: ${dryRunResult.message || dryRunResult.error}`
      };
    }
  } catch (error) {
    console.error('Error calculating max transfer amount:', error);
    return {
      maxAmount: 0,
      message: `${t('bsvPayment.statusMessages.feeCalculationFailed')}: ${error.message}`
    };
  }
};

function redirectBack(data) {
  // 支付服务处理完成后
  const paymentResult = new URLSearchParams({
    status: 'success',
    data: data,
  });

  // 构建回调URL - 从 query 参数获取 callbackUrl
  const callbackUrl = route.query.callbackUrl || '/pay-result'; // 从 route.query 获取 callbackUrl
  
  if (callbackUrl) {
    const separator = callbackUrl.includes('?') ? '&' : '?';
    const redirectUrl = `${callbackUrl}${separator}${paymentResult.toString()}`;
    // 重定向
    location.replace(redirectUrl);
  } else {
    console.error('No callbackUrl found in query parameters'); // 更新日志信息
  }
}

function sendDataToParent(data) {
  console.log('sendDataToParent ', data);
  if (window.opener) {
    // 向父窗口发送消息
    window.opener.postMessage(
      {
        type: 'payment_success',
        payload: { txid: data } // data 就是 txid
      },
      '*' // 指定父页面的源
    );
    
    // 监听父窗口的确认消息
    const handleConfirmation = (event) => {
      if (event.data && event.data.type === 'message_received') {
        console.log('收到父窗口确认消息，准备关闭窗口');
        window.removeEventListener('message', handleConfirmation);
        window.close();
      }
    };
    
    window.addEventListener('message', handleConfirmation);
  } else {
    console.error('No parent window or receiveDataFromChild function not found');
    redirectBack(data); // 回退到URL重定向方式
  }
}

const onPaymentSuccess = data => {
  console.log('onPaymentSuccess called with data:', data);
  // debugger
  if (window.opener) {
    sendDataToParent(data);
  } else {
    redirectBack(data);
  }
};

// 检查余额并处理交易
const checkBalance = async () => {
  try {
    // 优先使用 getBalance API 获取余额用于显示
    const totalBalance = await getBalance(address.value);
    balance.value = totalBalance.total; // 实时更新余额显示

    // 1. Dry Run: 检查余额是否足够支付，并获取精确费用
    console.log('Performing dry run to check funds...');
    // 确保 sendRequest.value 有效
    const currentSendRequest = sendRequest.value || [];

    // 检查 sendRequest 是否有效
    if (currentSendRequest.length === 0) {
      // 如果 sendRequest 仍然为空 (可能因为哈希解析失败或哈希不存在)
      console.warn('No valid payment request (sendRequest) available. Skipping balance check.');
      // 根据业务逻辑决定行为，例如显示错误或等待状态
      if (status.value !== 'error') { // 避免覆盖解析时设置的错误状态
        status.value = 'waiting'; // 或 'error'
        statusMessage.value = t('bsvPayment.statusMessages.missingParams'); // 或 'Invalid payment details'
      }
      checkInterval.value = false; // 停止轮询
      return false; // checkBalance 失败，因为没有有效的支付请求
    }

    // 仅在需要花费时获取 UTXOs 用于交易构建和 Dry Run
    const utxos = await getUTXOs(address.value);

    // 新增检查：如果 utxos 为空但 balance > 0，则认为是网络问题
    if (utxos.length === 0 && balance.value > 0) {
      console.error('UTXOs could not be fetched despite positive balance. Likely network issue with UTXO provider.');
      status.value = 'error';
      statusMessage.value = t('bsvPayment.statusMessages.errors.utxoFetchFailed'); // 需要添加这个i18n字符串
      checkInterval.value = false; // 停止轮询
      return false; // checkBalance 失败
    }

    const dryRunResult = await processRefund(utxos, currentSendRequest, true);

    if (dryRunResult.error === 'insufficient-funds') {
      // 余额不足
      minCost.value = dryRunResult.totalRequired || DEFAULT_MIN_COST; // 更新所需费用
      isAmountCalculated.value = true; // 标记金额已计算
      status.value = 'waiting';
      statusMessage.value = t('bsvPayment.statusMessages.waitingPay'); // 使用通用等待支付消息，不再显示具体金额
      console.log(`Insufficient funds. Required: ${minCost.value}, Balance: ${balance.value}. Starting/Continuing balance check loop.`);
      if (!checkInterval.value) {
        checkInterval.value = true;
        startBalanceCheck();
      }
      return true; // checkBalance 本身成功，但余额不足
    } else if (dryRunResult.error) {
      // Dry run 遇到其他错误
      console.error('Dry run failed:', dryRunResult.error, dryRunResult.message);
      status.value = 'error';
      // 尝试从 i18n 获取更友好的错误消息
      const i18nKey = `bsvPayment.statusMessages.errors.${dryRunResult.error}`;
      const fallbackMessage = `${t('bsvPayment.statusMessages.dryRunFailed')}: ${dryRunResult.message || dryRunResult.error}`;
      statusMessage.value = t(i18nKey, fallbackMessage); // 使用 t 函数处理，如果 key 不存在则回退

      checkInterval.value = false; // 停止轮询
      return false; // checkBalance 失败
    } else {
      // Dry run 成功，余额充足
      console.log(`Dry run successful. Sufficient funds. Required fee: ${dryRunResult.requiredFee}. Proceeding with actual transaction.`);
      checkInterval.value = false; // 准备广播，先停止轮询（如果正在运行）
      minCost.value = dryRunResult.totalRequired;
      isAmountCalculated.value = true; // 标记金额已计算

      // 2. Actual Run: 广播交易
      const processResult = await processRefund(utxos, currentSendRequest, false);

      if (processResult.error === 0) {
        // 交易成功广播 (processRefund 内部已处理状态和回调)
        console.log('Transaction broadcast successful:', processResult.txid);
        // 确保轮询已停止
        checkInterval.value = false;
        return true; // checkBalance 成功完成支付流程
      } else {
        // 广播失败或其他处理错误
        console.error('Transaction processing failed:', processResult.error, processResult.message);
        status.value = 'error';
        // 尝试从 i18n 获取更友好的错误消息
        const i18nKey = `bsvPayment.statusMessages.errors.${processResult.error}`;
        const fallbackMessage = `${t('bsvPayment.statusMessages.processStatus.error')}: ${processResult.message || processResult.error}`;
        statusMessage.value = t(i18nKey, fallbackMessage); // 使用 t 函数处理

        // 考虑是否需要重新启动轮询，取决于错误类型，暂时不启动
        checkInterval.value = false;
        return false; // checkBalance 失败
      }
    }
  } catch (error) {
    console.error('Failed to check balance or process transaction:', error);
    status.value = 'error';
    statusMessage.value = `${t('bsvPayment.statusMessages.balanceCheckFailed')}: ${error.message}`;
    checkInterval.value = false; // 发生意外错误，停止轮询
    return false; // checkBalance 执行失败
  }
};

// 开始定期检查余额
const startBalanceCheck = async () => {
  if (documentVisibility.value !== 'visible') return;

  while (checkInterval.value) {
    try {
      const checkResult = await checkBalance();

      // 检查失败直接结束循环
      if (!checkResult) {
        console.log('Check failed, stopping the loop...');
        break;
      }

      // 检查成功，等待 xs 后继续
      await new Promise(resolve => setTimeout(resolve, 6000));
    } catch (error) {
      console.error('Unexpected error in balance check loop:', error);
      break;
    }
  }

  // 循环结束时确保清理状态
  checkInterval.value = false;
};

// 停止余额检查
const stopBalanceCheck = () => {
  checkInterval.value = false;
};

// 处理交易创建和广播 (或 Dry Run)
const processRefund = async (utxos, request, dryRun = false) => {
  console.log(`processRefund called. dryRun: ${dryRun}, request:`, request);
  // 增加对 request 的健壮性检查
  if (!request || !Array.isArray(request) || request.length === 0) {
     console.error('Invalid payment request provided to processRefund:', request);
     return { error: 'invalid-request', message: 'Payment details are missing or invalid.' };
  }


  try {
    let privateKeyInstance;
    if (dryRun) {
      // Dry run 模式，使用模拟私钥
      privateKeyInstance = PrivateKey.fromWif(MOCK_DRY_RUN_WIF);
      console.log('Dry run mode: Using mock private key.');
    } else {
      // 非 Dry run 模式，加载真实私钥并提示 PIN
      status.value = 'processing';
      statusMessage.value = t('bsvPayment.statusMessages.processStatus.processing');
      // 使用 useWallet 中的 ensurePrivateKeyLoaded
      const result = await ensurePrivateKeyLoaded(pubKey.value, address.value);
      if (!result || !result.loadedPrivKey) {
        const errorMsg = statusMessage.value || t('bsvPayment.statusMessages.errors.privateKeyNotFound', '未找到私钥，无法执行操作。');
        status.value = 'error'; // 真实执行时，私钥加载失败是明确的错误状态
        statusMessage.value = errorMsg;
        return { error: 'private-key-not-loaded', message: errorMsg };
      }
      privateKeyInstance = result.loadedPrivKey;
    }
    // 私钥现在是 privateKeyInstance (PrivateKey 对象)
    const changeAddress = address.value;
    let client;
    if (!isGoogleReachable.value) {
      const dnsOptions = {
        dohServerBaseUrl: 'https://223.5.5.5/resolve'
      };
      client = new PaymailClient(undefined, dnsOptions);
    } else {
      client = new PaymailClient();
    }

    const tx = new Transaction();
    let satsOut = 0;
    const paymailRefs = []; // Declare paymailRefs array

    // 处理输出
    for (const req of request) {
      let outScript = new Script();
      if (req.address) {
        if (req.inscription) {
          // const { base64Data, mimeType, map } = req.inscription;
          // const formattedBase64 = removeBase64Prefix(base64Data);
          // outScript = new OrdP2PKH().lock(
          //   req.address,
          //   {
          //     dataB64: formattedBase64,
          //     contentType: mimeType,
          //   },
          //   map
          // );
        } else {
          outScript = new P2PKH().lock(req.address);
        }
      } else if (req.script) {
        outScript = Script.fromHex(req.script);
      } else if ((req.data || []).length > 0) {
        const asm = `OP_0 OP_RETURN ${req.data?.join(' ')}`;
        try {
          outScript = Script.fromASM(asm);
        } catch (e) {
          return { error: 'invalid-data' };
        }
      } else if (!req.paymail) {
        return { error: 'invalid-request' };
      }

      satsOut += req.satoshis;
      if (!req.paymail) {
        tx.addOutput({
          satoshis: req.satoshis,
          lockingScript: outScript,
        });
      } else {
        try {
          const p2pDestination = await client.getP2pPaymentDestination(req.paymail, req.satoshis);
          // console.log(p2pDestination); // Original console log
          if (p2pDestination && p2pDestination.outputs && p2pDestination.outputs.length > 0) {
            paymailRefs.push({ paymail: req.paymail, reference: p2pDestination.reference });
            for (const output of p2pDestination.outputs) {
              tx.addOutput({
                satoshis: output.satoshis,
                lockingScript: Script.fromHex(output.script),
              });
            }
          } else {
            console.error(`Could not get P2P payment destination for paymail: ${req.paymail}`, p2pDestination);
            return { error: 'paymail-resolve-failed', message: `Failed to resolve paymail ${req.paymail}` };
          }
        } catch (e) {
          console.error(`Error resolving paymail ${req.paymail}:`, e);
          return { error: 'paymail-resolve-error', message: `Error during paymail resolution for ${req.paymail}: ${e.message}` };
        }
      }
    }
    // 找零
    tx.addOutput({
      lockingScript: new P2PKH().lock(changeAddress),
      change: true,
    });

    let satsIn = 0;
    let fee = 0;
    const feeModel = new SatoshisPerKilobyte(10);
    const MIN_FEE = 2; // 定义最小费用常量, hi 大概是 5 sat
    
    // 新钱包初始化时计算基础费用
    if (!utxos || utxos.length === 0) {
      const estimatedOneInputFee = 2;
      fee = (await feeModel.computeFee(tx)) + estimatedOneInputFee;
    }
    
    for await (const u of utxos || []) {
      const pk = privateKeyInstance; // 使用已加载的私钥实例
      if (!pk) { //理论上 pkLoaded 检查后不会到这里
        console.error('Critical: Private key became null after successful load check in processRefund.');
        return { error: 'internal-error', message: 'Private key unavailable during UTXO processing.'};
      }

      // Check cache first
      let sourceTxHex = sourceTxCache.get(u.txid);
      if (!sourceTxHex) {
        // Fetch if not in cache
        sourceTxHex = await getSourceTransaction(u.txid);
        if (sourceTxHex) {
          // Store in cache if fetched successfully
          sourceTxCache.set(u.txid, sourceTxHex);
        } else {
          console.log(`Could not find source transaction ${u.txid} and it was not cached.`);
          return { error: 'source-tx-not-found' };
        }
      }

      const sourceTransaction = Transaction.fromHex(sourceTxHex);
      if (!sourceTransaction) {
        // This case should be less likely now due to the check above, but kept for safety
        console.log(`Could not parse source transaction from hex for ${u.txid}`);
        return { error: 'source-tx-not-found' };
      }
      tx.addInput({
        sourceTransaction,
        sourceOutputIndex: u.vout,
        sequence: 0xffffffff,
        unlockingScriptTemplate: new P2PKH().unlock(pk),
      });
      satsIn += Number(u.satoshis);
      // 计算费用，但确保最小费用为10聪，不断 addInput，只计算最后 tx 体积的费用
      fee = Math.max(await feeModel.computeFee(tx), MIN_FEE);
      if (satsIn >= satsOut + fee) break; // 输入金额够用了，结束遍历
    }

    const requiredFee = fee; // 保存计算出的费用
    const totalRequired = satsOut + requiredFee;

    // 检查余额是否充足
    if (satsIn < totalRequired) {
      const shortfall = totalRequired - satsIn;
      // minCost.value = totalRequired; // 更新全局最小成本为这次计算的总需求
      // isAmountCalculated.value = true; // 标记金额已计算 (此行被注释，保持一致)
      console.log(`Insufficient funds detected. Required: ${totalRequired} (Outputs: ${satsOut}, Fee: ${requiredFee}), Available: ${satsIn}, Shortfall: ${shortfall}`);
      if (!dryRun) {
         // 如果不是 dryRun，实际执行时发现不足，需要重置状态
         status.value = 'waiting';
      }
      // 返回更详细的错误信息
      return {
          error: 'insufficient-funds',
          totalRequired, // 返回总需求
          requiredFee,
          available: satsIn
       };
    }

    // 如果是 Dry Run，到此为止，返回成功和所需费用
    if (dryRun) {
      console.log(`Dry run successful. Estimated fee: ${requiredFee}, Total required: ${totalRequired}`);
      // 返回成功状态和计算出的费用
      return { error: 0, requiredFee: requiredFee, totalRequired };
    }

    // --- 以下为实际执行广播 ---
    console.log('Sufficient funds. Proceeding to sign and broadcast...');
    await tx.fee(requiredFee); // 设置最终费用
    await tx.sign();

    if (isDebug) {
      console.log('Debug mode: Skipping broadcast.');
      status.value = 'completed'; // 模拟成功
      statusMessage.value = 'Debug: Transaction prepared (not broadcast)';
      return { success: true, txid: 'debug-txid-not-broadcast' };
    }

    console.log('Broadcasting transaction...');
    // debugger
    const resp = await tx.broadcast();
    console.log('Broadcast response:', resp);
    const txHex = tx.toHex(); // Get txHex for P2P and Bitails broadcast

    // backup broadcast via Bitails (optional)
    // try {
    //   // console.log('Raw transaction:', txHex);
    //   broadcastTransactionWithBitails(txHex);
    // } catch (error) {
    //   console.error('Failed to broadcast transaction with Bitails:', error);
    // }

    // 检查是否存在竞争交易
    if (resp.status === 'success' && resp.txid && (!resp.competingTxs || resp.competingTxs.length === 0)) {
      status.value = 'completed';
      statusMessage.value = t('bsvPayment.statusMessages.processStatus.success');

      // Send P2P transactions if there are paymail recipients
      if (paymailRefs.length > 0) {
        for (const ref of paymailRefs) {
          try {
            const walletName = 'BitSPV.com'
            console.log(`Sending P2P payment to ${ref.paymail} with reference ${ref.reference}`);
            const metadata = { // Generic metadata
              sender: `${walletName} - ${truncate(address.value, 4, 4)}`,
              note: `P2P tx from ${walletName}`
            };

            await client.sendTransactionP2P(ref.paymail, txHex, ref.reference, metadata);
          } catch (p2pError) {
            console.error(`Failed to send P2P transaction to ${ref.paymail}:`, p2pError);
            // Log error, but don't let P2P failure necessarily block the main success flow
          }
        }
      }

      if (sendRequest.value) {
        setTimeout(() => {
          onPaymentSuccess(resp.txid); // 成功回调
        }, 100); // 短暂延迟以确保UI更新
      }
      return { error: 0, txid: resp.txid };
    } else {
      // 检查是否存在竞争交易
      if (resp.competingTxs && resp.competingTxs.length > 0) {
        const errorMessage = t('bsvPayment.statusMessages.errors.networkCongestion');
        console.error('Competing transactions detected:', resp.competingTxs);
        const broadcastError = new Error(errorMessage);
        broadcastError.code = 'network-congestion';
        broadcastError.details = { competingTxs: resp.competingTxs, ...resp };
        throw broadcastError;
      }
      // 其他广播失败情况
      const errorMessage = resp.error || resp.message || resp.status || 'Unknown broadcast error';
      console.error('Broadcast failed:', errorMessage);
      // 抛出包含详细信息的错误，以便上层捕获
      const broadcastError = new Error(`Broadcast failed: ${errorMessage}`);
      broadcastError.details = resp; // 附加原始响应信息
      throw broadcastError;
    }

  } catch (error) {
    console.error('Failed to process transaction:', error);
    const errorMessage = error.message || String(error);
     if (!dryRun) { // 只有在实际执行时才更新全局状态为错误
        status.value = 'error';
        // 尝试从 i18n 获取更友好的错误消息
        const i18nKey = `bsvPayment.statusMessages.errors.${error.code || 'processing-error'}`; // 尝试使用错误代码
        const fallbackMessage = `${t('bsvPayment.statusMessages.processStatus.error')}: ${errorMessage}`;
        statusMessage.value = t(i18nKey, fallbackMessage);
     }
    // 返回包含错误的结构化对象
    // 尝试从错误对象中提取更多信息
    return {
       error: error.code || 'processing-error', // 使用错误代码（如果可用）
       message: errorMessage,
       requiredFee: error.requiredFee, // 如果错误包含费用信息
       details: error.details // 附加的详细信息
    };
  }
};

// 移除 showDeleteWalletConfirm, cancelDeleteWallet, confirmDeleteWallet 函数，因为它们已迁移到 useWallet 或由 WalletManager 处理
const showDeleteWalletConfirm = () => {
  console.warn('showDeleteWalletConfirm is deprecated in Payment.vue. Use WalletManager for wallet management.');
};

const cancelDeleteWallet = () => {
  console.warn('cancelDeleteWallet is deprecated in Payment.vue.');
};

const confirmDeleteWallet = () => {
  console.warn('confirmDeleteWallet is deprecated in Payment.vue.');
};

// 新增：刷新余额方法
const refreshBalance = async () => {
  if (isRefreshingBalance.value) return;
  isRefreshingBalance.value = true;
  statusMessage.value = t('bsvPayment.statusMessages.refreshingBalance'); // 您可能需要添加这个 i18n 字符串

  try {
     const totalBalance = await getBalance(address.value);
     balance.value = totalBalance.total;
     statusMessage.value = t('bsvPayment.statusMessages.balanceRefreshed'); // 您可能需要添加这个 i18n 字符串
    // 如果之前有错误状态，可以清除
    if (status.value === 'error' && !sendRequest.value) { // 仅在非支付流程中清除错误状态
      status.value = 'waiting'; // 或者一个更合适的状态
    }
  } catch (error) {
    console.error('Failed to refresh balance:', error);
    status.value = 'error';
    statusMessage.value = t('bsvPayment.statusMessages.errors.refreshBalanceFailed'); // 您可能需要添加这个 i18n 字符串
  } finally {
    isRefreshingBalance.value = false;
  }
};

// 关闭旧钱包警告
const closeOldWalletWarning = () => {
  showOldWalletWarning.value = false;
  localStorage.setItem(OLD_WALLET_WARNING_CLOSED_KEY, 'true');
};

// 生命周期钩子
onMounted(async () => {
  console.log('window.opener:', window.opener);
  console.log('window.location.origin:', window.location.origin);
  console.log('document.referrer:', document.referrer);
  // 检查是否已关闭旧钱包警告
  if (localStorage.getItem(OLD_WALLET_WARNING_CLOSED_KEY) === 'true') {
    showOldWalletWarning.value = false;
  }

  const { ciphertext: encryptedWif } = storage.getEncryptedWifData();
  const oldPlaintextWif = storage.getOldPlaintextWif(); // 使用 useStorage 获取旧格式私钥

  if (!encryptedWif && !oldPlaintextWif) {
    // 如果没有找到任何钱包数据，提示用户创建或导入
    const choice = await showConfirmationDialog(
      t('bsvPayment.walletSetup.title'),
      t('bsvPayment.walletSetup.prompt'),
      t('bsvPayment.walletSetup.createButton'),
      t('bsvPayment.walletSetup.importButton')
    );

    if (choice) { // 用户选择创建钱包
      const result = await createWallet(); // 使用 useWallet 中的 createWallet
      if (result?.error) {
        status.value = 'error';
        statusMessage.value = result.message;
        return;
      }
      if (result?.walletName) {
        walletName.value = result.walletName;
      }
      await handlePaymentRequest();
    } else { // 用户选择导入钱包
      await nextTick(); // 确保 importFileInput.value 已更新
      const result = await handleRequestImportWallet(importFileInput.value); // 使用 useWallet 中的 handleRequestImportWallet
      if (result?.error) {
        status.value = 'error';
        statusMessage.value = result.message;
      } else if (result?.walletName) {
        walletName.value = result.walletName;
      }
    }
  } else {
    // 如果存在钱包数据，则正常初始化钱包
    const result = await createWallet(); // 使用 useWallet 中的 createWallet
    if (result?.error) {
      status.value = 'error';
      statusMessage.value = result.message;
      return;
    }
    if (result?.walletName) {
      walletName.value = result.walletName;
    }
    await handlePaymentRequest();
  }
});

onUnmounted(() => {
  stopBalanceCheck();
});
</script>
