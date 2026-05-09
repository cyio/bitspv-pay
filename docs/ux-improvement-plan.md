# UX 改进计划：提升易用性与降低上手门槛

> 分析日期：2026-05-08
> 目标用户：传统互联网用户、其他 Web3 钱包用户、新接触 BSV 的用户

---

## 一、与工业级应用的核心差距

### 1. 首次启动无引导 (Onboarding 缺失)

**现状**：新用户打开后直接弹出模态框，三个按钮（创建/导入/观察地址），无任何说明。
**问题**：不解释"这是什么"，不说明每个选项的适用场景，新用户无从判断。
**工业标准**：MetaMask、Trust Wallet 均有 2-4 步引导流程，说明产品定位、解释选项差异、提醒备份重要性。
**涉及文件**：`src/components/PinDialog.jsx` (SetupDialogContent)

### 2. 错误状态缺乏可操作性

**现状**：错误显示技术性文本（"UTXO 可能已失效"、"Passkey 身份验证失败"），无下一步提示。
**问题**：用户看到错误不知道该做什么。
**工业标准**：错误信息 = 问题描述 + 建议操作 + 可选的重试按钮。
**涉及文件**：`src/locales/cn.js` (statusMessages.errors), `src/components/PaymentStatus.jsx`

### 3. 关键操作无确认摘要

**现状**：普通转账点"发送"后直接触发 PIN 验证，没有显示"向 XXX 发送 X BSV，手续费 Y sats"的确认页。
**问题**：与冷钱包流程（有确认摘要 step）形成不一致，普通转账反而风险更高。
**涉及文件**：`src/components/WalletManager.jsx` (executeTransfer)

### 4. 状态机信息不透明

**现状**：钱包加载时只显示 spinner + "钱包加载中..."；支付等待时 statusMessage 为空时回退到"等待支付..."。
**问题**：用户不清楚当前在做什么、等了多久、是否卡住了。
**涉及文件**：`src/pages/Payment.jsx`, `src/components/PaymentStatus.jsx`

### 5. Air-Gap 流程入口深且命名难懂

**现状**：入口路径为 管理钱包（折叠）→ 展开 → "扫码签名（冷钱包）"。
**问题**：即使是 Web3 用户，不熟悉 Air-Gap/冷钱包概念的人无法理解这个功能。
**涉及文件**：`src/components/WalletManager.jsx`, `src/components/AirGapFlow.jsx`

---

## 二、传统互联网用户的上手障碍

### 1. 概念冲击未被消化

| 界面文字 | 用户困惑点 |
|---|---|
| "BSV 地址" / "Paymail" | 不知道这是什么，为何有两种格式 |
| "sats / BSV" 单位 | 完全陌生，不知道和人民币/美元怎么对应 |
| "WIF 私钥" / "Passkey" | 两个不同安全概念同时出现 |
| "PSBT"、"Air-Gap" | 完全无法理解 |

**改进方向**：关键术语加 tooltip/说明链接；单位统一优先显示法币；将 WIF 和 Passkey 的说明分步骤拆开。

### 2. PIN 码设置缺乏引导

**现状**：弹出"设置新钱包"对话框，要求输入钱包名称 + PIN，有一行小字说明 PIN 用途。
**问题**：
- 没有解释 PIN 一旦忘记就无法找回（非服务端存储）
- 没有"确认 PIN"二次输入验证
- PIN 强度无视觉反馈

**涉及文件**：`src/pages/Payment.jsx` (promptForPin 'set' mode), `src/components/PinDialog.jsx`

### 3. 备份流程令人恐惧

**现状**：备份按钮 → 严厉警告弹框 → 确认 → 显示 QR → 下载。
**问题**：
- 警告文本威胁性过强，导致用户不敢操作或不知所措
- 下载后没有后续引导（"去安全的地方保存"）
- 没有"测试恢复"验证环节

**涉及文件**：`src/components/WalletManager.jsx` (showBackup, displayQrCodeModal)

### 4. 余额展示不直观

**现状**：`余额: 0.00001234 BSV ($0.01)`，精度过高。
**改进方向**：根据金额大小动态切换单位（小额用 sats，大额用 BSV），法币金额更突出显示。
**涉及文件**：`src/components/WalletInfo.jsx`

### 5. 转账地址输入无实时验证

**现状**：地址输入后无反馈，点"发送"才报错。
**改进方向**：输入框 blur 或输入停顿后实时校验，合法地址显示绿色✓，非法地址实时提示。
**涉及文件**：`src/components/WalletManager.jsx` (targetAddress onChange)

---

## 三、其他 Web3 钱包用户的上手障碍

### 1. 非标准的 UX 导航模式

**现状**：单页展开式（accordion），主要操作藏在"管理钱包"折叠面板内。
**问题**：主流钱包（MetaMask、OKX、Phantom）使用底部 Tab 或侧边导航，用户肌肉记忆不匹配。

### 2. 网络/节点连接状态不可见

**现状**：没有任何地方显示"当前连接到 BSV 主网"或 API 节点状态。
**问题**：遇到 UTXO fetch 失败等异常，用户无法判断是网络问题还是应用问题。
**涉及文件**：`src/utils/apiProviderHealth.js` (已有健康检测逻辑，但未在 UI 呈现)

### 3. 手续费不透明

**现状**：有"最大"按钮（含手续费计算），但普通转账不提前显示预估手续费。
**问题**：EVM 钱包用户强依赖 Gas 预估；BTC 用户习惯看 sat/vB 费率。
**改进方向**：在金额输入后，异步计算并展示预估手续费（可复用 `calculateMaxSpendable` 逻辑）。
**涉及文件**：`src/components/WalletManager.jsx`, `src/hooks/useWallet.js`

### 4. 交易历史入口隐蔽

**现状**：历史记录在右上角一个不显眼的时钟图标，无文字标注。
**问题**：主流钱包将交易历史作为主要页面之一。
**涉及文件**：`src/pages/Payment.jsx` (History icon button)

### 5. 导入钱包体验反直觉

**现状**：导入 = 触发文件选择器，选择 QR 码截图文件。
**问题**：
- 其他钱包支持助记词/WIF 私钥文本粘贴
- 文件选择对非 BitSPV 用户完全不知道要选什么
- 没有明确说明支持的格式

**涉及文件**：`src/pages/Payment.jsx` (handleFileChange, handleRequestImportWallet)

### 6. 无多账户管理

**现状**：单钱包，删除才能切换。
**问题**：现代钱包普遍支持多账户切换。（长期规划）

---

## 四、改进优先级

| 优先级 | 问题 | 影响面 | 涉及文件 |
|---|---|---|---|
| **P0** | 转账前增加确认摘要（金额+手续费+收款方） | 所有用户，防误操作 | WalletManager.jsx |
| **P0** | 地址输入实时验证反馈 | 所有用户 | WalletManager.jsx |
| **P1** | 首次启动添加简短产品说明卡片 | 新用户 | PinDialog.jsx (setup mode) |
| **P1** | 错误信息增加"该怎么做"操作提示 | 所有用户 | cn.js errors, PaymentStatus.jsx |
| **P1** | 导入钱包支持直接粘贴 WIF 文本（不止文件） | Web3 用户 | Payment.jsx |
| **P2** | 交易历史入口增加文字标注或移至更显眼位置 | 所有用户 | Payment.jsx |
| **P2** | 手续费在转账表单中预估显示 | Web3 用户 | WalletManager.jsx |
| **P2** | PIN 设置增加二次确认输入 + 强度提示 | 新用户 | Payment.jsx, PinDialog.jsx |
| **P2** | API 节点连接状态在 UI 中可见 | Web3 用户 | Payment.jsx, apiProviderHealth.js |
| **P3** | Air-Gap 流程重命名 + 增加入门说明 | 高级用户 | WalletManager.jsx, AirGapFlow.jsx |
| **P3** | 余额展示根据金额动态切换单位 | 新用户 | WalletInfo.jsx |
