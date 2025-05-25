<template>
  <div class="relative mt-4">
    <!-- 转账按钮，仅在钱包模式下显示 -->
    <button
      v-if="props.isWalletMode"
      @click="toggleTransferSection"
      class="w-full px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
    >
      {{ $t('bsvPayment.transfer.transferButton') }}
    </button>

    <!-- 转账区域 -->
    <div v-if="showTransferSection" class="mt-4 px-2 py-4 bg-gray-100 dark:bg-gray-700 rounded">
      <h2 class="text-lg font-semibold mb-3">{{ $t('bsvPayment.transfer.transferTitle') }}</h2>
      <div class="mb-3">
        <label for="targetAddress" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {{ $t('bsvPayment.transfer.targetAddressLabel') }}
        </label>
        <div class="flex items-center gap-2">
          <input
            type="text"
            id="targetAddress"
            v-model="targetAddress"
            :placeholder="$t('bsvPayment.transfer.targetAddressPlaceholder')"
            class="flex-1 px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-gray-800 dark:text-white"
          />
          <QRScanner @scan-result="handleScanResult">
            <template #trigger="{ scan }">
              <button
                @click="scan"
                class="px-3 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                :title="$t('bsvPayment.scanButton')"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </template>
          </QRScanner>
        </div>
      </div>
      <div class="mb-3">
        <label for="transferAmount" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {{ $t('bsvPayment.transfer.transferAmountLabel') }}
        </label>
        <div class="flex items-center gap-2">
          <input
            type="number"
            id="transferAmount"
            v-model.number="transferAmount"
            :placeholder="$t('bsvPayment.transfer.transferAmountPlaceholder')"
            class="flex-1 px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-800 dark:text-white"
          />
          <div class="text-sm text-gray-600 dark:text-gray-300">
            <span v-if="props.maxTransferAmountValue !== null">
              {{ $t('bsvPayment.transfer.maxLabel') }}:
              <button @click="setAmountToMax" class="text-blue-500 hover:underline">
                {{ convertSatoshisToBSV(props.maxTransferAmountValue) }}
              </button>
              {{ $t('bsvPayment.transfer.unit') }}
            </span>
            <span v-else>{{ $t('bsvPayment.transfer.calculating') }}...</span>
          </div>
        </div>
      </div>
       <!-- 转账状态显示 -->
      <div v-if="transferStatus" class="mb-3 text-sm break-words" :class="{
          'text-blue-600 dark:text-blue-300': transferStatus === 'processing',
          'text-green-600 dark:text-green-300': transferStatus === 'completed',
          'text-red-600 dark:text-red-300': transferStatus === 'error',
        }">
        {{ transferMessage }}
      </div>
      <div class="flex justify-end gap-2">
        <button
          @click="toggleTransferSection"
          class="px-4 py-2 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
        >
          {{ $t('bsvPayment.cancelButton') }}
        </button>
        <button
          @click="executeTransfer"
          :disabled="!targetAddress || !transferAmount || transferAmount <= 0 || transferAmount > props.maxTransferAmountValue || props.maxTransferAmountValue === null || props.maxTransferAmountValue <= 0 || transferStatus === 'processing'"
          class="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
           {{ transferStatus === 'processing' ? $t('bsvPayment.processingButton') : $t('bsvPayment.confirmTransferButton') }}
        </button>
      </div>
    </div>

    <!-- 管理钱包按钮，仅在钱包模式下显示 -->
    <button
      v-if="props.isWalletMode"
      @click="toggleManagePanel"
      class="w-full mt-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
    >
      <span>{{ $t('bsvPayment.manageWalletButton') }}</span>
      <svg
        class="w-4 h-4 transition-transform"
        :class="{ 'rotate-180': showManagePanel }"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- 管理面板 -->
    <div
      v-if="props.isWalletMode"
      v-show="showManagePanel"
      class="mt-2 py-4 px-1 bg-gray-50 dark:bg-gray-700 rounded shadow-lg transition-all duration-200 ease-in-out"
    >
      <!-- 管理按钮组 -->
      <div class="flex flex-wrap justify-center gap-2">
        <button
          @click="showBackup"
          class="px-3 py-2 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors"
        >
          {{ $t('bsvPayment.backupWalletButton') }}
        </button>
        <button
          @click="triggerImportWallet"
          class="px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
        >
          {{ $t('bsvPayment.importWalletButton') }}
        </button>
        <button
          @click="showDeleteWalletConfirm"
          class="px-3 py-2 text-sm bg-red-800 text-white rounded hover:bg-red-900 transition-colors"
        >
          {{ $t('bsvPayment.deleteWalletButton') }}
        </button>
      </div>

      <!-- 私钥二维码弹窗 -->
      <Modal :visible="showQrModal" @close="showQrModal = false" :title="$t('bsvPayment.privateKeyQrModalTitle')" modal-class="w-11/11 md:w-1/3 lg:max-w-md">
        <div class="p-4 text-center">
          <img v-if="privateKeyQrCodeUrl" :src="privateKeyQrCodeUrl" alt="Private Key QR Code" class="w-48 h-48 mx-auto my-4" />
          <div v-else class="w-48 h-48 bg-gray-200 dark:bg-gray-600 mx-auto my-4 flex items-center justify-center text-xs text-gray-500 dark:text-gray-300">
            {{ $t('bsvPayment.qrLoading') }}
          </div>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ $t('bsvPayment.qrCodeDownloadTip') }}</p>
          <p class="mt-2 text-xs text-red-500 dark:text-red-400">{{ $t('bsvPayment.privateKeyWarning') }}</p>
        </div>
        <template #footer>
          <button
            @click="downloadPrivateKeyQrCode"
            class="w-full px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            {{ $t('bsvPayment.downloadQrCodeButton') }}
          </button>
        </template>
      </Modal>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'; // 导入 watch
import { useI18n } from 'vue-i18n';
import { isValidAddress, convertSatoshisToBSV, isValidPaymail, generateEncryptedDataQrCodeUrl, downloadEncryptedDataQrCode } from '../utils/bsv'; // 导入加密数据二维码生成和下载函数
import { showConfirmationDialog } from '../utils/confirm'; // 导入 showConfirmation
import QRScanner from './QRScanner.vue';
import Modal from './Modal.vue';

const { t } = useI18n();

// 定义props和emits
const props = defineProps({
  address: {
    type: String,
    required: true
  },
  maxTransferAmountValue: {
    type: Number,
    default: null
  },
  isWalletMode: { // 新增 prop
    type: Boolean,
    default: true // 默认为钱包模式
  },
  getWifFunction: { // 新增 prop 用于获取 WIF
    type: Function,
    required: true
  }
});

const emit = defineEmits(['clear-wallet', 'delete-wallet', 'request-calculate-max-transfer', 'transfer-funds', 'request-import-wallet']);

// 状态变量
const showManagePanel = ref(false);
const showBackupPlaceholder = ref(false);
const showQrModal = ref(false);
const privateKeyQrCodeUrl = ref(''); // 用于存储二维码图片URL
const showTransferSection = ref(false);
const activeBackupData = ref(null); // 修改：用于在二维码显示期间临时存储备份数据 (加密数据)
const targetAddress = ref('');
const transferAmount = ref(null);
const transferStatus = ref(null);
const transferMessage = ref('');

// 使用传入的地址，用于备份状态键
const currentAddress = computed(() => {
  return props.address;
});

// 处理扫码结果
const handleScanResult = (result) => {
  if (result.error) {
    updateTransferStatus('error', result.error);
  } else if (isValidAddress(result.data) || isValidPaymail(result.data)) {
    targetAddress.value = result.data;
  } else {
    updateTransferStatus('error', t('bsvPayment.statusMessages.errors.invalidQRCode'));
  }
};

// 更新转账状态
const updateTransferStatus = (status, message) => {
  transferStatus.value = status;
  transferMessage.value = message;
};

onMounted(() => {
});

// 切换管理面板显示状态
const resetPanels = () => {
  showQrModal.value = false;
  privateKeyQrCodeUrl.value = ''; // 重置二维码URL
  activeBackupData.value = null; // 清除临时备份数据
  showTransferSection.value = false;
  updateTransferStatus(null, '');
};

const toggleManagePanel = () => {
  showManagePanel.value = !showManagePanel.value;
};

// 显示/隐藏备份信息
const showBackup = async () => {
  resetPanels();
  
  let backupData = null;
  if (props.getWifFunction) {
    backupData = await props.getWifFunction();
    if (!backupData) {
      return;
    }
  }

  activeBackupData.value = backupData; // 临时存储备份数据

  const confirmed = await showConfirmationDialog(
    t('bsvPayment.backupPlaceholderWarningText'), // Main warning text
    t('bsvPayment.backupPlaceholderWarningTitle'), // Title of the confirmation
    t('bsvPayment.showQrCodeButton'), // Confirm button text (e.g., "I Understand the Risks, Show QR Code")
    t('bsvPayment.cancelButton'), // Cancel button text
    'text-red-600 dark:text-red-400 font-bold' // Add red text and bold class for warning
  );

  if (confirmed) {
    displayQrCodeModal(activeBackupData.value); // 使用临时存储的备份数据显示二维码
  } else {
    activeBackupData.value = null; // 用户取消，清除备份数据
  }
};

// 显示二维码弹窗
const displayQrCodeModal = async (backupDataForQr) => { // 接收备份数据作为参数
  if (backupDataForQr && backupDataForQr.encryptedWif && backupDataForQr.iv && backupDataForQr.salt && backupDataForQr.address) {
    privateKeyQrCodeUrl.value = await generateEncryptedDataQrCodeUrl(backupDataForQr, backupDataForQr.address);
  } else {
    privateKeyQrCodeUrl.value = ''; // 确保没有旧的或无效的二维码显示
    console.warn('WalletManager: displayQrCodeModal 调用时备份数据为空或不完整。');
  }
  showQrModal.value = true;
};

// 下载私钥二维码
const downloadPrivateKeyQrCode = async () => {
  // 检查 activeBackupData.value 是否完整且包含所有必要的加密字段
  if (activeBackupData.value && activeBackupData.value.encryptedWif && activeBackupData.value.iv && activeBackupData.value.salt && activeBackupData.value.address && props.address) {
    await downloadEncryptedDataQrCode(activeBackupData.value, props.address);
  } else {
    console.error('Encrypted backup data or address is not available or incomplete for QR code download (modal likely closed or data not fetched).');
    updateTransferStatus('error', t('bsvPayment.statusMessages.errors.privateKeyNotAvailableForDownload'));
  }
};

// 监听 showQrModal 变化，在弹窗关闭时清除临时备份数据和二维码URL
watch(showQrModal, (isModalVisible) => {
  if (!isModalVisible) {
    activeBackupData.value = null; // 清除临时存储的备份数据
    privateKeyQrCodeUrl.value = '';   // 清除二维码 URL
  }
});

// 切换转账面板显示状态
const toggleTransferSection = () => {
  if (showTransferSection.value) {
    showTransferSection.value = false;
    return;
  }
  resetPanels();
  showTransferSection.value = true;
  transferAmount.value = null;
  emit('request-calculate-max-transfer');
};

// 设置金额为最大可转金额
const setAmountToMax = () => {
  if (props.maxTransferAmountValue !== null) {
    transferAmount.value = convertSatoshisToBSV(props.maxTransferAmountValue);
  }
};

// 执行转账操作
const executeTransfer = () => {
  updateTransferStatus('processing', t('bsvPayment.statusMessages.processStatus.processing'));
  const currentTargetAddress = targetAddress.value;
  if (!currentTargetAddress || (!isValidAddress(currentTargetAddress) && !isValidPaymail(currentTargetAddress))) {
    updateTransferStatus('error', t('bsvPayment.statusMessages.errors.invalidAddressOrPaymail'));
    return;
  }
  if (!transferAmount.value || transferAmount.value <= 0) {
    updateTransferStatus('error', t('bsvPayment.statusMessages.errors.invalidAmount'));
    return;
  }
  if (transferAmount.value > convertSatoshisToBSV(props.maxTransferAmountValue)) {
    updateTransferStatus('error', t('bsvPayment.statusMessages.errors.amountExceedsMax'));
    return;
  }
  try {
    emit('transfer-funds', currentTargetAddress, Number((transferAmount.value * 100000000).toFixed(0)));
  } catch (error) {
    console.error('Failed to emit transfer-funds event:', error);
    updateTransferStatus('error', t('bsvPayment.statusMessages.errors.transferFailed'));
  }
};

// 监听父组件完成的回调
const onTransferComplete = (status, message) => {
  if (status === 'completed') {
    targetAddress.value = '';
    transferAmount.value = null;
  }
  updateTransferStatus(status, message);
};

// 触发文件选择
const triggerImportWallet = async () => {
  resetPanels();
  if (props.address) {
    const confirmMessage = t('bsvPayment.importConfirmation.message');
    const confirmTitle = t('bsvPayment.importConfirmation.title');
    const confirmButton = t('bsvPayment.importConfirmation.confirmButton');
    const cancelButton = t('bsvPayment.importConfirmation.cancelButton');

    const confirmed = await showConfirmationDialog(
      confirmMessage,
      confirmTitle,
      confirmButton,
      cancelButton
    );

    if (!confirmed) {
      updateTransferStatus('error', t('bsvPayment.statusMessages.info.importCancelled'));
      console.log('User cancelled wallet import at prompt.');
      return;
    }
  }
  emit('request-import-wallet');
};

// 显示删除钱包确认对话框
const showDeleteWalletConfirm = async () => {
  resetPanels();
  const confirmed = await showConfirmationDialog(
    t('bsvPayment.deleteWalletWarning'),
    t('bsvPayment.deleteWalletTitle'),
    t('bsvPayment.confirmDeleteButton'),
    t('bsvPayment.cancelButton'),
    'text-red-600 dark:text-red-400 font-bold' // Add red text and bold class for warning
  );

  if (confirmed) {
    confirmDeleteWallet();
  }
};

// 确认删除钱包操作 (now called after showConfirmation)
const confirmDeleteWallet = async () => {
  try {
    emit('delete-wallet');
  } catch (error) {
    console.error('Failed to delete wallet:', error);
  }
};

// 暴露回调方法给父组件
defineExpose({
  updateTransferStatus: onTransferComplete,
});
</script>
