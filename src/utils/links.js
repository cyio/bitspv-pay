/**
 * 外部链接只在这里写一次。
 *
 * 离线冷存储入口必须指向 **releases/latest** 而不是某个具体文件名：
 * 产物名带版本号与 git 短哈希（`bitspv-pay-offline-v<version>-<hash>.html`），
 * 写死就会在下一个 release 之后变成 404。
 */
export const REPO_URL = 'https://github.com/cyio/bitspv-pay';

export const OFFLINE_RELEASE_URL = `${REPO_URL}/releases/latest`;
