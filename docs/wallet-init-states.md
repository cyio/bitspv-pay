# 钱包初始化状态机

> 2026-11-16。替换掉「用一个关不掉的模态兜住所有未知状态」的写法。

## 为什么改

改之前，页面只有一个三元表达式：

```
isWalletUiVisible ? 钱包 : needsRecovery ? 重试卡 : needsSetup ? 导入卡 : 转圈
```

于是「本机还没有钱包」这个**正常状态**没有任何位置可落：

- 首屏三个条件全是 false → 落到「Loading wallet…」，而它正好被一个自动弹出的设置模态盖住；
- 那个模态 `showCancelButton: false` + `hideModalHeaderCloseButton: true`，`PinDialog.handleClose`
  的条件又是 `showCancelButton || !hideModalHeaderCloseButton`，两个 false 时点遮罩、按 Esc、
  点 X 全都不生效 —— 关不掉；
- 万一被关掉，`setup-cancelled` 走 `applyInitResult` 的兜底分支进了 `initError`，页面同时显示
  「密码设置已取消。您的钱包尚未受密码保护。」和转圈。

## 现在的状态

`Payment.jsx` 里 `initState`：

| 状态 | 含义 | 界面 |
|---|---|---|
| `loading` | `createWallet` 正在读取本地状态 | 转圈（唯一会转圈的状态） |
| `empty` | 本机没有钱包 | 空态卡：创建 / 导入 / 观察地址 + 冷存储链接 |
| `recovery` | 加密私钥还在，地址缓存丢了 | 解锁重建 + 导入两个入口 |
| `failed` | 初始化真的失败 | 行内错误（2px 左线）+ 重新加载 |
| `ready` | 有地址 | 钱包界面 |

补充：`viewState` 兜底 —— `ready` 但地址为空（例如删钱包未刷新）按 `empty` 渲染，不再落回转圈。

## 状态怎么变

| 事件 | 结果 |
|---|---|
| 启动 `createWallet()` 返回 `no-wallet` | → `empty`（不是错误） |
| 空态点「创建新钱包」→ `createNewWallet()` 成功 | → `ready` |
| 创建时取消密码 | → `empty`，**不写错误**（密钥没落盘，丢弃即可） |
| 空态点「导入钱包」 | 直接打开文件选择框；成功后 `address` 存在 → `ready`，取消则留在 `empty` |
| 空态点「添加观察地址」→ 确认 | → `ready`（watch-only） |
| 启动返回 `wallet-needs-recovery` / `wallet-unrecoverable` | → `recovery` |
| 其他错误 | → `failed` |

## 弹窗规则

- 除「设密码（`set`）」以外，所有弹窗都有 X、可点遮罩关闭、支持 `Esc`。
  `set` 也可取消 —— 此时生成的密钥直接丢弃，不会有半成品落盘。
- 关闭一律走 `onReject({cancelled})`，调用方回到**上一个稳定状态**，不显示错误文案。
- 初始化相关错误只在 `recovery` / `failed` 分支渲染，弹窗打开时不再在背后显示。
- 设置向导（`promptForPin('setup')` / `PinDialog` 的 `SetupDialogContent`）已删除：
  它的内容搬进空态卡，首屏不再自动弹任何模态。

## 涉及文件

- `src/hooks/useWallet.js`：`createWallet` 无钱包时返回 `no-wallet`；新增 `createNewWallet()`、`createWatchOnly()`
- `src/pages/Payment.jsx`：`initState` / `viewState`、空态卡、失败卡、删除 `setup` 模式
- `src/components/PinDialog.jsx`：`canClose`、Esc、X 的 hover 修复、删除 `SetupDialogContent`
- `src/locales/{cn,en}.js`：`walletSetup.retry`、`bsvPayment.trustLine`
