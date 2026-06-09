// Service provider health status and selection logic

const explorerUrls = {
  bananablocks: 'https://bananablocks.com/tx/',
  whatsOnChain: 'https://whatsonchain.com/tx/',
  bitails: 'https://bitails.io/tx/',
};

const serviceProviders = {
  bananablocks: {
    name: 'bananablocks',
    healthy: true,
    latency: 0,
    lastChecked: 0,
    failures: 0,
  },
  whatsOnChain: {
    name: 'whatsOnChain',
    healthy: true,
    latency: 0, // in milliseconds
    lastChecked: 0, // timestamp
    failures: 0, // consecutive failures
  },
  bitails: {
    name: 'bitails',
    healthy: true,
    latency: 0,
    lastChecked: 0,
    failures: 0,
  },
  // ... other service providers
};

const STORAGE_KEY = 'preferred_api_provider';
let currentPreferredProviderName = localStorage.getItem(STORAGE_KEY) || 'bananablocks';

function setPreferredProvider(name) {
  if (!serviceProviders[name]) return;
  currentPreferredProviderName = name;
  localStorage.setItem(STORAGE_KEY, name);
}

function getAvailableProviders() {
  return Object.keys(serviceProviders);
}

/**
 * Updates the health status of a service provider.
 * @param {string} providerName - The name of the service provider.
 * @param {boolean} success - Whether the request was successful.
 * @param {number} latency - The request latency in milliseconds.
 */
function updateProviderHealth(providerName, success, latency = 0) {
  const provider = serviceProviders[providerName];
  if (!provider) return;

  provider.lastChecked = Date.now();
  if (success) {
    provider.healthy = true;
    provider.latency = latency;
    provider.failures = 0;
  } else {
    provider.failures++;
    if (provider.failures >= 3) { // Mark as unhealthy after 3 consecutive failures
      provider.healthy = false;
    }
    provider.latency = Infinity; // Mark as unavailable
    // If the currently unhealthy provider is the preferred one, reset the preference
    if (currentPreferredProviderName === providerName) {
      currentPreferredProviderName = null;
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

/**
 * Gets the currently recommended service provider.
 * @returns {object|null} The recommended service provider object, or null if no healthy providers are available.
 */
function getRecommendedProvider() {
  // If the current preferred provider exists and is healthy, return it directly
  if (currentPreferredProviderName && serviceProviders[currentPreferredProviderName]?.healthy) {
    return { name: currentPreferredProviderName, ...serviceProviders[currentPreferredProviderName] };
  }

  // Otherwise, re-select the best provider
  const availableProviders = Object.keys(serviceProviders)
    .filter(key => serviceProviders[key].healthy)
    .sort((a, b) => serviceProviders[a].latency - serviceProviders[b].latency);

  if (availableProviders.length > 0) {
    currentPreferredProviderName = availableProviders[0];
    return { name: currentPreferredProviderName, ...serviceProviders[currentPreferredProviderName] };
  }

  // If no healthy providers are available, fall back to current preferred option
  // (which is initialized based on isWeChat)
  console.warn(`No healthy providers available. Falling back to ${currentPreferredProviderName}.`);
  // Return it even if it might be unhealthy to prevent total application failure
  return { name: currentPreferredProviderName, ...serviceProviders[currentPreferredProviderName] };
}

function getTxExplorerUrl(txid) {
  const provider = currentPreferredProviderName || 'whatsOnChain';
  const base = explorerUrls[provider] || explorerUrls.whatsOnChain;
  return `${base}${txid}`;
}

export {
  updateProviderHealth,
  getRecommendedProvider,
  getTxExplorerUrl,
  setPreferredProvider,
  getAvailableProviders,
};
