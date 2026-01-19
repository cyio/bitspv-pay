import React from 'react';
import { useTranslation } from 'react-i18next';
import { convertSatoshisToBSV, convertSatoshisToFiat } from '../utils/bsv';

const PaymentStatus = ({
  status,
  statusMessage,
  isAmountCalculated,
  minCost,
  rate,
  walletBalance,
  statusColor,
}) => {
  const { t } = useTranslation();

  return (
    <div className="mb-2">
      {isAmountCalculated && (
        <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="text-center text-gray-800 dark:text-gray-100">
            <div className="text-lg font-bold">
              {t('bsvPayment.totalAmountLabel')}: {convertSatoshisToBSV(minCost)} BSV
              {rate && <span className="text-base font-normal text-gray-600 dark:text-gray-300"> (${convertSatoshisToFiat(minCost, rate)})</span>}
            </div>
            {minCost > walletBalance.total && (
              <div className="mt-2 text-red-600 dark:text-red-400">
                {t('bsvPayment.supplementAmountLabel', { amount: convertSatoshisToBSV(minCost - walletBalance.total) })}
              </div>
            )}
          </div>
        </div>
      )}
      <div className={`text-center text-sm mt-1 ${statusColor}`}>
        <p>{statusMessage || t('bsvPayment.statusMessages.waitingPay')}</p>
      </div>
      {['waiting', 'processing'].includes(status) && (
        <div className="h-6 w-full flex justify-center mt-2">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
};

export default PaymentStatus;
