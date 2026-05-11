# 冷热分离签名方案（Air-Gap Signing）

## 背景

BSV 轻钱包的私钥安全性取决于所在设备。对于有较高安全需求的用户，需要将私钥隔离在一台永不联网的冷端设备上，由联网的热端设备负责查询余额和广播交易，两台设备之间通过二维码传递数据，物理隔离网络。

---

## 整体架构

```
热端（联网，无私钥）                冷端（离线，有私钥）
─────────────────────────────────────────────────
1. 查询 UTXO
2. 构建未签名交易（SigningRequest）
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

### QR① — SigningRequest（热端 → 冷端）

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

**字段说明：**

- `checksum`：随机 4 位十六进制码，供用户目视比对冷热两端，确认 QR 数据一致。
- `createdAt`：热端构建时间（Unix ms）。冷端超过 2 小时后会显示过期提示，但不阻止签名——用户自行判断是否继续。注意冷端设备长期离线，本地时钟可能存在偏差，该提示仅供参考。

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

- `txreq:<base64url>` — SigningRequest
- `signed:<base64url>` — 已签名交易

---

## 关键技术决策

### 1. 二维码体积优化：直接从 Hex 解析详情
热端 `buildUnsignedTx` 不再传输 `request`（冗余），仅传输交易 `unsignedTxHex` 和 `utxos`。冷端直接反序列化 Hex，自动识别并过滤找零输出，提取转账详情，压缩体积并提升可靠性。

### 2. 安全增强：交易校验码（Checksum）
热端生成随机 4 位十六进制码嵌入 payload，冷端扫码后同步显示，用户肉眼比对两端核对码，确认 QR 数据未被篡改后再签名。

### 3. 不传 source TX hex，改用 Stub TX

#### 背景

BSV SDK 签名时需要知道每个输入对应源交易输出的两个字段：该输出锁定的 `satoshis` 和 `lockingScript`。正常做法是把完整源交易 hex 传给 SDK 让它自行解析，但这会显著增大 QR 体积。

#### Stub TX 是什么

Stub（存根交易）是一个专为满足 SDK 接口而手动构造的最小交易对象——只填入签名所需的那个输出位置的 `satoshis` 和 `lockingScript`，其他字段留空。SDK 拿到 stub 后能正常完成 sighash 计算，但 stub 本身不是合法交易，无法广播。

```
真实 source TX：[完整输入] + [完整输出] + [完整元数据]  ← 200–500 字节 / 笔
Stub TX：        只有 outputs[vout].satoshis + lockingScript ← 几十字节
```

#### 为什么不传完整 source TX

QR 二进制模式上限约 2953 字节（Version 40 / L 级）。两种方案在不同输入数量下的体积对比（gzip + base64url 后）：

| 输入数 | 当前方案（Stub） | 传完整 source TX |
|--------|----------------|-----------------|
| 3      | ~610 字节       | ~1940 字节       |
| 5      | ~900 字节       | ~3130 字节 ✗     |
| 10     | ~1640 字节      | 超出              |
| 18     | ~2780 字节      | 超出              |
| 19     | ~2930 字节（临界）| 超出             |

传完整 source TX 在 5 个输入时即超出单码容量；Stub 方案可支持约 18 个输入，对 UTXO 碎片化严重的钱包尤为重要。

#### 风险评估

Stub 的 `satoshis` 来自 QR① 中的 `utxos` 字段，由热端提供，冷端无法独立验证。若该值被篡改：

- **转账金额**（付给收款方多少）：用户在冷端确认界面可见，是主要的防篡改控制点。
- **UTXO satoshis**（输入里有多少钱）：用于 sighash 计算，用户不会专门核对。

BSV 使用原始 Bitcoin sighash 算法，sighash **不 commit 输入的 satoshis**（不同于 BIP143/SegWit）。因此即使 `satoshis` 被篡改，签名在数学上仍然有效，交易可以广播——最坏后果是矿工多收手续费，而非资金损失。

`lockingScript` 才是签名安全性的实际锚点（错误的 lockingScript 会导致 sighash 错误，签名无效，广播失败）。该字段同样来自热端，但验证路径与完整 source TX 方案一致：用户通过核对码比对冷热两端的 checksum 来防止中间人篡改整个 QR payload。

**复杂脚本限制**：冷端签名时对所有输入一律使用 `P2PKH().unlock(privateKey)` 模板（`signTransaction` L356），这是 Stub 方案的硬编码假设。若 UTXO 实际为多签（P2MS）、自定义 OP 脚本等非 P2PKH 类型，该模板会生成错误的解锁脚本，签名无效，广播失败。当前钱包仅支持 P2PKH 地址，此限制不影响正常使用，但扩展脚本类型时需同步替换解锁模板。

### 4. Fee 估算

热端使用 SDK 的 `LivePolicy.computeFee(tx)` 对实际 tx 对象做序列化估算：inputs 上已挂载 `P2PKH().unlock(mockPrivKey)` 模板，SDK 从模板推算解锁脚本的预期字节数，得出真实体积对应的费用。

`148`（P2PKH 单输入字节数）只用于计算**最低 fee 兜底值**，不是实际估算公式：

```js
const minimumFee = Math.ceil(feeModel.value * (148 / 1000));  // 兜底下限
const fee = Math.max(await feeModel.computeFee(tx), minimumFee);  // 实际取较大值
```

**精度**：P2PKH DER 签名长度为 70–72 字节，SDK 按固定长度估算，误差 ±1–2 字节/输入，对应 ±1 sat/输入，可以忽略。

**OP_RETURN 限制**：air-gap 路径（`buildUnsignedTx`）只处理 `address` 和 `script` 类型输出，`data`（OP_RETURN）输出会被静默忽略。当前 UI 入口只支持 address / paymail，不受影响，但若未来扩展输出类型需注意补全该分支。

### 5. P2P 通知异步化
Paymail P2P 通知改为后台异步任务，广播成功后立即返回，防止通知阻塞广播流程。

**paymailRefs 的归属**：`reference` 由热端在构建 QR① 时调用 `getP2pPaymentDestination` 获得，与该次生成的 outputs（即 txHex 中的锁定脚本）绑定。热端始终持有这份数据，冷端无需感知。QR② 只传 `txHex`，`paymailRefs` 由热端从内存中直接取用。

**reference 过期**：air-gap 流程耗时较长，reference 可能在广播前过期。一旦 P2P 通知失败，热端会提示用户"对方钱包可能需要手动刷新"。交易已广播上链，资金不受影响，P2P 通知属于 best-effort。

### 6. 视觉引导式扫码
将扫描区限制为视频中心 70%，并绘制视觉引导框，与常见扫码界面对齐，提高识别率。

---

## 涉及文件

| 文件 | 职责 |
|------|------|
| `src/utils/signing-request.js` | 序列化/反序列化逻辑 |
| `src/utils/transaction.js` | 核心构建与签名逻辑 |
| `src/components/AirGapFlow.jsx` | 离线签名 UI 状态机 |
| `src/components/QRScanner.jsx` | 裁剪式视觉扫描器 |
