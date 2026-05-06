/**
 * PSBT (Partially Signed Bitcoin Transaction) 序列化工具
 *
 * 热端 → 冷端：PsbtPayload  （前缀 "psbt:"）
 * 冷端 → 热端：SignedTxPayload（前缀 "signed:"）
 *
 * 编码：JSON → pako.deflate（gzip）→ base64url
 * 单个 QR 码容量：Version 40 / L 级约 7000 字节，足以承载 3-5 个 BSV 输入。
 */

import { deflate, inflate } from 'pako';

const PSBT_PREFIX = 'psbt:';
const SIGNED_PREFIX = 'signed:';

// base64url（不含 padding），与 URL 安全且对 QR 友好
function toBase64url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromBase64url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4;
  const base64 = pad ? padded + '='.repeat(4 - pad) : padded;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encode(obj) {
  const json = JSON.stringify(obj);
  const compressed = deflate(json, { level: 6 });
  return toBase64url(compressed);
}

function decode(str) {
  try {
    const bytes = fromBase64url(str);
    const json = inflate(bytes, { to: 'string' });
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * 序列化 PSBT Payload（热端构建，冷端签名）
 *
 * @param {Object} payload
 * @param {string}   payload.address        发送方地址（找零用）
 * @param {Array}    payload.request        原始支付请求（已完成 Paymail 解析，全为 address/script/data）
 * @param {Array}    payload.utxos          选中的 UTXO，每项包含 { txid, vout, satoshis, sourceTxHex }
 * @param {number}   payload.fee            热端计算的 fee（sats）
 * @param {number}   payload.createdAt      Unix timestamp（ms）
 * @returns {string}  以 "psbt:" 开头的 QR 字符串
 */
export function serializePsbt(payload) {
  return PSBT_PREFIX + encode({ version: 1, ...payload });
}

/**
 * 反序列化 PSBT Payload
 * @param {string} str
 * @returns {Object|null}
 */
export function deserializePsbt(str) {
  if (typeof str !== 'string' || !str.startsWith(PSBT_PREFIX)) return null;
  return decode(str.slice(PSBT_PREFIX.length));
}

/**
 * 序列化已签名 Tx Payload（冷端签名，热端广播）
 *
 * @param {Object} payload
 * @param {string}   payload.txHex          完整已签名交易 hex
 * @param {Array}    [payload.paymailRefs]  Paymail P2P 通知数据（若有）
 * @returns {string}  以 "signed:" 开头的 QR 字符串
 */
export function serializeSignedTx(payload) {
  return SIGNED_PREFIX + encode({ version: 1, ...payload });
}

/**
 * 反序列化已签名 Tx Payload
 * @param {string} str
 * @returns {Object|null}
 */
export function deserializeSignedTx(str) {
  if (typeof str !== 'string' || !str.startsWith(SIGNED_PREFIX)) return null;
  return decode(str.slice(SIGNED_PREFIX.length));
}

/**
 * 判断 QR 字符串类型
 * @param {string} str
 * @returns {'psbt' | 'signed' | null}
 */
export function detectQrType(str) {
  if (typeof str !== 'string') return null;
  if (str.startsWith(PSBT_PREFIX)) return 'psbt';
  if (str.startsWith(SIGNED_PREFIX)) return 'signed';
  return null;
}
