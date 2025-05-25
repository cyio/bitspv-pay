/**
 * 获取本地存储的备份状态键
 * @param {string} address 钱包地址
 * @returns {string} 备份状态键
 */
export const getBackupStatusKey = (address) => {
  return `backup_status_${address}`;
};

export const ZHIHU_PROFILE_URL = 'https://www.zhihu.com/people/oaker';
export const TWITTER_PROFILE_URL = 'https://twitter.com/cloudsay'; // 已更新为实际 Twitter Handle

export const CONTACT_URL = locale => locale.includes('zh') ? ZHIHU_PROFILE_URL : TWITTER_PROFILE_URL;

// 用于 dryRun 的模拟私钥 WIF
export const MOCK_DRY_RUN_WIF = 'Kyam1tTv4geh6RJkJRFygNrEeN9kkRQpYCkFPYwBf4LRgMiA3Cec';
