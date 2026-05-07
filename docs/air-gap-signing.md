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
  "unsignedTxHex": "0100000001...",
  "utxos": [
    { "txid": "abc123...", "vout": 0, "satoshis": 500000 }
  ],
  "checksum": "8A4F",
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

### 1. 二维码体积优化：直接从 Hex 解析详情
热端 `buildUnsignedTx` 不再传输 `request`（冗余），仅传输交易 `unsignedTxHex` 和 `utxos`。冷端直接反序列化 Hex，自动识别并过滤找零输出，提取转账详情，压缩体积并提升可靠性。

### 2. 安全增强：交易校验码（Checksum）
热端对交易 Hex 生成 4 位 SHA256 校验码。冷热两端同时显示，用户通过比对确保签名数据未被中间人篡改。

### 3. 不传 source TX hex
为减小二维码体积，冷端不获取完整源交易 Hex。对于 P2PKH 钱包，通过重建 stub 交易仅提供 SDK 所需的 `satoshis` 和 `lockingScript`。

### 4. 手动 Fee 估算
由于无法获取 source TX 进行精确计算，改用 P2PKH 固定字节尺寸手动估算费率：`txBytes = numInputs × 148 + numOutputs × 34 + 10`。

### 5. P2P 通知异步化
Paymail P2P 通知改为后台异步任务，广播成功后立即返回，防止通知阻塞广播流程。

### 6. 视觉引导式扫码
将扫描区限制为视频中心 70%，并绘制视觉引导框，与常见扫码界面对齐，提高识别率。

---

## 涉及文件

| 文件 | 职责 |
|------|------|
| `src/utils/psbt.js` | 序列化/反序列化逻辑 |
| `src/utils/transaction.js` | 核心构建与签名逻辑 |
| `src/components/AirGapFlow.jsx` | 离线签名 UI 状态机 |
| `src/components/QRScanner.jsx` | 裁剪式视觉扫描器 |
