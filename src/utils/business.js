const receiveAddress = '1FNPZsXQPPSf2Q4nrPyiCop4iwPMsTwYAc';
const feePerDownload = 10000;

function checkPayCommon(config) {
  const paymentParams = [
    {
      satoshis: config?.feePerDownload || feePerDownload,
      address: config?.receiveAddress || receiveAddress,
    },
  ];
  checkPay(paymentParams);
}

async function checkPay(paymentParams) {
  if (!paymentParams) return;
  const wallet = getProvider();
  const isConnected = await wallet.isConnected();
  if (isConnected) {
    try {
      const { txid, rawtx } = await wallet.sendBsv(paymentParams);
      console.log('txid', txid);
      return { success: true, txid, errorCode: null, errorMessage: null };
    } catch (err) {
      return { success: false, errorCode: err.code || 'Unknown', errorMessage: err.message || err };
    }
  } else {
    try {
      let res = await wallet.connect();
      if (res) {
        return await checkPay(paymentParams);
      }
      console.log('Connect result: ', res);
      return {
        success: false,
        errorCode: 'ConnectionFailed',
        errorMessage: 'Failed to connect to wallet.',
      };
    } catch (err) {
      console.error(
        'Connection Error Code:',
        err.code || 'Unknown',
        'Message:',
        err.message || err
      );
      return { success: false, errorCode: err.code || 'Unknown', errorMessage: err.message || err };
    }
  }
}

function disconnectWallet() {
  const wallet = getProvider();
  wallet.disconnect();
}

function getProvider() {
  let provider = window.panda || window.yours;
  return provider;
}

export const business = {
  checkPay,
  checkPayCommon,
  getProvider,
  disconnectWallet,
  receiveAddress,
  feePerDownload,
};
