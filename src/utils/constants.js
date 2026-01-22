/**
 * Gets the local storage key for backup status.
 * @param {string} address The wallet address.
 * @returns {string} The backup status key.
 */
export const getBackupStatusKey = (address) => {
  return `backup_status_${address}`;
};

export const ZHIHU_PROFILE_URL = 'https://www.zhihu.com/people/oaker';
export const TWITTER_PROFILE_URL = 'https://twitter.com/cloudsay'; // Updated to the actual Twitter Handle

export const CONTACT_URL = locale => locale.includes('zh') ? ZHIHU_PROFILE_URL : TWITTER_PROFILE_URL;

// Mock private key WIF for dryRun
export const MOCK_DRY_RUN_WIF = 'Kyam1tTv4geh6RJkJRFygNrEeN9kkRQpYCkFPYwBf4LRgMiA3Cec';
