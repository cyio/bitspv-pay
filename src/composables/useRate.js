import { ref, onMounted, onUnmounted } from 'vue';
import { getExchangeRate } from '../utils/api';

const rate = ref(null);
const lastUpdated = ref(null);

export function useRate() {
  let intervalId;

  const fetchRate = async () => {
    try {
      const response = await getExchangeRate();
      if (response && response.rate) {
        rate.value = response.rate;
        lastUpdated.value = Date.now();
        console.log(`Exchange rate updated: 1 BSV = ${rate.value} USD`);
      }
    } catch (error) {
      console.error('Failed to fetch exchange rate:', error);
    }
  };

  onMounted(() => {
    fetchRate(); // Initial fetch
    intervalId = setInterval(fetchRate, 5 * 60 * 1000); // Fetch every 5 minutes
  });

  onUnmounted(() => {
    if (intervalId) {
      clearInterval(intervalId);
    }
  });

  return {
    rate,
    lastUpdated,
    fetchRate,
  };
}
