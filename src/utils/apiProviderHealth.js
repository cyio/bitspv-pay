// 服务提供商健康状态和选择逻辑

const serviceProviders = {
  whatsOnChain: {
    name: 'whatsOnChain',
    healthy: true,
    latency: 0, // 毫秒
    lastChecked: 0, // 时间戳
    failures: 0, // 连续失败次数
  },
  bitails: {
    name: 'bitails',
    healthy: true,
    latency: 0,
    lastChecked: 0,
    failures: 0,
  },
  // ... 其他服务商
};

let currentPreferredProviderName = 'whatsOnChain'; // 初始默认值

/**
 * 更新服务商健康度
 * @param {string} providerName - 服务商名称
 * @param {boolean} success - 请求是否成功
 * @param {number} latency - 请求延迟 (毫秒)
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
    if (provider.failures >= 3) { // 连续失败3次标记为不健康
      provider.healthy = false;
    }
    provider.latency = Infinity; // 标记为不可用
    // 如果当前不健康的是首选服务商，则重置首选
    if (currentPreferredProviderName === providerName) {
      currentPreferredProviderName = null; // 强制重新选择
    }
  }
}

/**
 * 获取当前推荐的服务商
 * @returns {object|null} 推荐的服务商对象，如果没有可用的健康服务商则返回 null
 */
function getRecommendedProvider() {
  // 如果当前首选服务商存在且健康，则直接返回
  if (currentPreferredProviderName && serviceProviders[currentPreferredProviderName]?.healthy) {
    return { name: currentPreferredProviderName, ...serviceProviders[currentPreferredProviderName] };
  }

  // 否则，重新选择最佳服务商
  const availableProviders = Object.keys(serviceProviders)
    .filter(key => serviceProviders[key].healthy)
    .sort((a, b) => serviceProviders[a].latency - serviceProviders[b].latency);

  if (availableProviders.length > 0) {
    currentPreferredProviderName = availableProviders[0];
    return { name: currentPreferredProviderName, ...serviceProviders[currentPreferredProviderName] };
  }

  // 如果没有可用的健康服务商，返回 whatsOnChain 作为兜底
  console.warn('No healthy providers available. Falling back to whatsOnChain.');
  currentPreferredProviderName = 'whatsOnChain'; // 重置首选为兜底选项
  // 即使它可能不健康，也返回它以避免应用程序完全失败
  return { name: 'whatsOnChain', ...serviceProviders.whatsOnChain };
}

export {
  updateProviderHealth,
  getRecommendedProvider,
};
