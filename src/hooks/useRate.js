import { useState, useEffect, useCallback } from 'react';
import { getExchangeRate } from '../utils/api';

export const useRate = () => {
  const [rate, setRate] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchRate = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getExchangeRate();
      if (data && data.rate) {
        setRate(parseFloat(data.rate));
      } else {
        throw new Error('Invalid rate data from API');
      }
    } catch (e) {
      setError(e);
      console.error('Failed to fetch exchange rate:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRate();
  }, [fetchRate]);

  return { rate, isLoading, error, refreshRate: fetchRate };
};
