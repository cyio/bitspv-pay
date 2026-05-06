# 冷热分离签名方案（Air-Gap Signing）

## 背景

BSV 轻钱包的私钥安全性取决于所在设备。对于有较高安全需求的用户，需要将私钥隔离在一台永不联网的冷端设备上，由联网的热端设备负责查询余额和广播交易，两台设备之间通过二维码传递数据，物理隔离网络。

---

## 整体架构

```
热端（联网，无私钥）                冷端（离线，有私钥）
─────────────────────────────────────────────────
1. 查询 UTXO
2. 构建未签名交易（PSBT Payload）
3. 生成 QR①
                    ──── 扫 QR① ────▶
                    4. 解析交易内容
                    5. 用户确认
                    6. PIN 解密私钥
                    7. 签名
                    8. 生成 QR②
                    ◀──── 扫 QR② ────
9. 广播已签名交易
```

### 设备模式

| 模式 | localStorage 标志 | 能力 |
|------|-------------------|------|
| 正常钱包 | `encrypted-wif` 存在 | 查询 + 签名 + 广播 |
| 观察钱包（热端） | `watch-only: true` | 查询 + 广播（不能签名） |
| 冷端钱包 | `encrypted-wif` 存在，离线使用 | 签名（不查询网络） |

---

## 核心数据格式

### QR① — PSBT Payload（热端 → 冷端）

```json
{
  "version": 1,
  "address": "1AbCd...",
  "request": [
    { "address": "1XyZ...", "satoshis": 100000 }
  ],
  "utxos": [
    { "txid": "abc123...", "vout": 0, "satoshis": 500000 }
  ],
  "fee": 27,
  "createdAt": 1746000000000
}
```

### QR② — 已签名 Tx（冷端 → 热端）

```json
{
  "version": 1,
  "txHex": "0100000001...",
  "paymailRefs": [{ "paymail": "user@domain.com", "reference": "xxx" }]
}
```

### 序列化方式

`JSON → pako.deflate（gzip level 6）→ base64url`，加前缀标识类型：

- `psbt:<base64url>` — PSBT Payload
- `signed:<base64url>` — 已签名交易

---

## 关键技术决策

### 1. 不传 source TX hex

**背景**：BSV SDK（`@bsv/sdk`）在 `addInput` 时通常要求提供完整的 source transaction，以便读取 `outputs[vout].satoshis` 和 `outputs[vout].lockingScript` 用于签名。

**问题**：一笔 source TX hex 约 400–4000 字符，1–3 个输入即可使 QR 内容超过 3KB，手机摄像头扫描极难成功，且压缩率低（交易数据近似随机二进制，gzip 效果差）。

**解决方案**：冷端用 stub sourceTransaction 替代完整原始交易。

SDK 签名时只访问 `sourceTransaction.outputs[vout].satoshis` 和 `.lockingScript`，与 source TX 其他内容无关。对于 P2PKH 钱包：

- `satoshis`：UTXO 本身携带，无需网络
- `lockingScript`：P2PKH 钱包所有 UTXO 的 locking script 均为 `P2PKH.lock(address)`，冷端可直接重建

```js
// 冷端重建 stub
const stubTx = new Transaction();
stubTx.outputs = Array(utxo.vout + 1).fill(null);
stubTx.outputs[utxo.vout] = {
  satoshis: utxo.satoshis,
  lockingScript: new P2PKH().lock(address),
};

tx.addInput({
  sourceTXID: utxo.txid,      // 真实 txid，用于 sighash outpoint
  sourceTransaction: stubTx,  // 仅供 SDK 读 satoshis/lockingScript
  sourceOutputIndex: utxo.vout,
  unlockingScriptTemplate: new P2PKH().unlock(privateKey),
});
```

依据：SDK 源码（`Transaction.js` L539-L549）在序列化 input 时，txid 优先取 `sourceTXID` 字段，仅在其为空时才计算 `sourceTransaction.hash()`，因此两个字段互不干扰。

**效果**：每个 UTXO 从 ~1000 字节降至 ~80 字节，QR 内容从 1–4KB 降至 < 200 字节，手机可轻松扫描。

---

### 2. 热端 fee 估算

由于不获取 source TX，无法用 `LivePolicy.computeFee(tx)` 精确计算（该方法需要 tx 有完整 inputs）。改用 P2PKH 固定尺寸手动估算：

```
txBytes = numInputs × 148 + numOutputs × 34 + 10
fee = ceil(feeRatePerKb × txBytes / 1000)
```

P2PKH input 固定 148 字节，output 固定 34 字节，overhead 10 字节，误差极小。

---

### 3. Paymail P2P 通知过期问题

**问题**：`getP2pPaymentDestination` 返回的 `reference` 有时效限制（通常数分钟）。Air-gap 流程需要用户在两设备间手动扫码，耗时可能超过有效期，导致 `sendTransactionP2P` 抛出 `AbortError`。

**问题的连锁反应**：AbortError 原本被 inner try-catch 捕获，但若意外逃逸至 outer catch，会使 `broadcastSignedTx` 返回 `error: 'broadcast-error'`，界面误报"广播失败"，实际交易已上链。

**解决方案**：P2P 通知改为 fire-and-forget（IIFE async），广播成功后立即返回 txid，通知在后台异步执行，失败只记 warn 日志，不影响主流程。

---

### 4. QR 扫描识别率

**问题**：`QRScanner` 原来将整帧视频（全屏）传给 jsQR，QR 码像素占比极低，需凑到取景框 90% 以上才能识别。

**解决方案**：扫描时只裁剪视频帧的中心正方形区域（短边的 70%）传给 jsQR，同时在 UI 上绘制对应尺寸的引导框。

```js
const cropSize = Math.round(Math.min(vw, vh) * 0.7);
const cropX = Math.round((vw - cropSize) / 2);
const cropY = Math.round((vh - cropSize) / 2);
canvas.width = cropSize;
canvas.height = cropSize;
ctx.drawImage(video, cropX, cropY, cropSize, cropSize, 0, 0, cropSize, cropSize);
```

UI 引导框使用 `box-shadow: 0 0 0 9999px rgba(0,0,0,0.55)` 实现"中心透明、四周半透明"效果，四角白色 L 形标记提示对准区域，与微信/支付宝扫码风格一致。

---

## 涉及文件

| 文件 | 职责 |
|------|------|
| `src/utils/psbt.js` | PSBT/SignedTx 序列化：pako + base64url，前缀识别 |
| `src/utils/transaction.js` | `buildUnsignedTx` / `signPsbt` / `broadcastSignedTx` |
| `src/components/AirGapFlow.jsx` | 热端（AirGapSender）和冷端（AirGapSigner）UI 状态机 |
| `src/components/QRScanner.jsx` | 中心裁剪扫描 + 视觉引导框 |
| `src/components/WalletManager.jsx` | 按 isWatchOnly 切换"转账（离线签名）"/"离线签名"入口 |
| `src/hooks/useStorage.js` | `getIsWatchOnly` / `setIsWatchOnly` |
| `src/hooks/useWallet.js` | watch-only 模式加载与创建分支 |
| `src/components/PinDialog.jsx` | setup 对话框增加"添加观察地址"选项 |
| `src/pages/Payment.jsx` | `watch-address` promptForPin 模式；透传新 props |
