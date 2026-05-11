# PRF 钱包方案设计

> **状态：概念方案，尚未实现。** 本文档仅作为技术调研与决策参考，代码库中当前仍使用 PIN 加密方案。

## 背景

当前 PIN 方案的核心问题：加密私钥存在 localStorage，PIN 是唯一保护层。攻击者拿到加密数据后可离线暴力破解短 PIN（4-6 位纯数字秒破）。

PRF 方案通过 WebAuthn PRF 扩展，让私钥完全由设备安全芯片派生，不存在可离线破解的数据。

---

## 什么是 PRF eval

PRF（Pseudo-Random Function，伪随机函数）是 WebAuthn 的一个扩展能力。

```
PRF 输出 = HMAC-SHA256(Passkey内部密钥, eval输入)
```

- **Passkey 内部密钥**：注册时由设备安全芯片（Secure Enclave / TPM）生成，永不离开芯片
- **eval 输入**：你传给 PRF 的任意字节，相当于"问题"
- **PRF 输出**：固定 32 字节，相当于"答案"

性质：
- 确定性：同一设备、同一 Passkey、同一 eval 输入，永远输出相同 32 字节
- 不可预测：没有设备 + 生物识别，无法算出输出
- 独立性：不同 eval 输入得到完全不相关的输出（可用于派生多个钱包）

---

## 整体流程

### 创建钱包

```
用户点击"创建钱包"
        │
        ▼
浏览器调用 WebAuthn create
+ PRF 扩展（eval: "bsv-wallet-slot-0"）
        │
        ▼
用户完成生物识别（Face ID / 指纹）
        │
        ▼
设备安全芯片返回 PRF 输出（32 字节）
        │
        ▼
HKDF 派生（info: "bsv-privkey-v1"）
        │
        ▼
256-bit 私钥 → 公钥 → 地址
        │
        ▼
localStorage 存：地址、公钥、credentialId（均为公开信息）
私钥立即丢弃，从不落盘
```

### 日常使用（签名交易）

```
用户发起交易
        │
        ▼
浏览器调用 WebAuthn get
+ PRF 扩展（eval: "bsv-wallet-slot-0"）
        │
        ▼
用户完成生物识别
        │
        ▼
设备返回相同 PRF 输出（32 字节）
        │
        ▼
HKDF → 相同私钥
        │
        ▼
签名交易
        │
        ▼
私钥立即丢弃
```

### 清除浏览器缓存后恢复

```
用户打开 App，localStorage 为空
        │
        ▼
显示"恢复钱包"按钮
        │
        ▼
浏览器调用 WebAuthn get（不指定 credentialId）
用户从系统弹窗选择已有 Passkey
        │
        ▼
用户完成生物识别
        │
        ▼
PRF 输出 → HKDF → 相同私钥 → 相同地址
        │
        ▼
重新写入 localStorage（地址、公钥、credentialId）
钱包恢复完成
```

---

## eval 输入的维护

eval 输入由钱包应用开发方定义和维护，不是用户可见的概念。

**单钱包（当前主场景）**：eval 硬编码为固定常量，无需存储，清缓存后照样恢复：

```js
const EVAL_INPUT = new TextEncoder().encode('bsv-wallet-v1')
```

**多钱包**：同一个 Passkey，传不同的 eval 输入，派生出完全独立的私钥：

| 钱包槽位 | eval 输入 | PRF 输出 | 私钥 |
|---|---|---|---|
| 钱包 1 | `bsv-wallet-slot-0` | `0xA3B2...` | 私钥 A |
| 钱包 2 | `bsv-wallet-slot-1` | `0x7F1C...` | 私钥 B |

多钱包时需在 localStorage 存槽位编号（普通数字，非敏感数据）。若 localStorage 被清，可顺序扫描槽位并查链上余额来重新发现钱包：

```
slot-0 → 派生地址 A → 链上查 → 有余额 ✓ 恢复
slot-1 → 派生地址 B → 链上查 → 无余额，跳过
```

---

## 密钥派生细节

```
PRF 输出（32 字节）
        │
        ▼
  crypto.subtle.importKey → HKDF 密钥材料
        │
        ▼
  HKDF-SHA256
    salt:  new Uint8Array(32)  // 全零，PRF 本身已提供随机性
    info:  "bsv-privkey-v1"    // 版本标识，未来升级用 v2
        │
        ▼
  256-bit 输出 → BSV 私钥
```

info 字段版本化的意义：将来若需要升级派生方案，旧钱包（v1）和新钱包（v2）可以从同一 Passkey 独立共存。

---

## 与现有方案对比

| | 当前 PIN 方案 | PRF 方案 |
|---|---|---|
| 私钥存储 | AES-GCM 加密后存 localStorage | 不存储，用时派生 |
| 离线暴力破解 | 可以（短 PIN 秒破） | 不可能（需要设备+生物识别） |
| 清缓存后恢复 | 需要加密 blob 备份 + PIN | Passkey 认证一次自动恢复 |
| 用户备份负担 | WIF 明文备份（用户容易忽略） | Passkey 同步（iCloud/Google 自动） |
| 忘记密码 | 私钥不可恢复 | 无密码，无此问题 |
| Passkey 彻底丢失 | 不影响（PIN 照样解） | 私钥不可恢复（极端情况） |
| 浏览器兼容性 | 全兼容 | Chrome 118+、Safari 17+，Firefox 不支持 |

---

## 风险与缓解

**Passkey 丢失**

概率很低：iCloud Keychain 和 Google Password Manager 都会跨设备同步 Passkey。换手机、重装系统均可自动恢复。极端情况（账号封禁、全设备损毁）下确实无法恢复。

缓解方式：在 UI 中明确提示"这是基于设备的钱包，请确保 iCloud/Google 账号备份已开启"，并保留可选的 WIF 导出入口供高级用户使用。

**域名失效**

PRF 的 rpId 与注册时的域名绑定。域名失效后 Passkey 无法触发，PRF 输出无法取得，私钥永久不可派生。这是 PIN 方案不存在的运营风险。

缓解方式：
- 注册 Passkey 时将 `rpId` 设为根域名（如 `example.com`）而非子域名（如 `wallet.example.com`），子域名变更不影响已有 Passkey
- 根域名本身若无法续期，无技术手段兜底
- WIF 导出入口应在 UI 中保持显眼，不能藏入高级设置

定位建议：PRF 方案适合轻量小额场景，默认不要求用户备份。大额使用应在 UI 中主动引导导出 WIF。

**不适合冷钱包场景**

PRF 方案的安全性依赖 iCloud/Google 云同步来保障 Passkey 的可恢复性。冷钱包的核心原则是私钥完全离线、不依赖任何云服务，二者矛盾。冷钱包用户应继续使用离线生成 WIF + 硬件隔离的方案。

**浏览器不兼容**

Firefox 目前不支持 PRF 扩展。

缓解方式：检测 PRF 支持，不支持时回退到当前 PIN 流程，或提示用户切换浏览器。

---

## 涉及改动文件

- `src/utils/webauthn.js`：注册和认证时加入 PRF 扩展，新增 `deriveKeyFromPrf()` 函数
- `src/hooks/useWallet.js`：创建/解锁钱包时调用 PRF 派生替代 PIN 解密
- `src/hooks/usePinManager.js`：PIN 流程降级为兼容路径（浏览器不支持 PRF 时）
- `src/components/PinDialog.jsx`：PRF 支持时隐藏，不支持时保留
- `src/hooks/useStorage.js`：移除 `encrypted-wif` 相关字段，新增 `credential-id`、`wallet-slot`
