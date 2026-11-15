# AGENTS.md — BitSPV Pay

> 跨仓规则、产品清单、域名与部署登记：`~/Projects/bitspv-workspace/AGENTS.md`（清单 `workspace.json`）。
> 这份只写**本仓**的事。

非托管 BSV 钱包：热钱包收发 + 观察地址监控 + 断网离线签名（单文件冷端）。React + Vite + Tailwind 3 + Radix，纯前端，无后端。

```bash
pnpm dev            # 本地
pnpm build          # 唯一门禁（本仓没有 lint / typecheck 脚本）
pnpm ship           # 预览发布，跑完发 Telegram 通知
pnpm ship:prod      # 生产发布 → pay.bitspv.com
pnpm build:offline  # 单文件离线版
```

## 先读

`README.md` · `RELEASE.md`

## 硬约束

1. **`VITE_` 变量对访客是公开的。** 构建时会被字面量替换进 JS，`VITE_AUTH_TOKEN`、`VITE_TAAL_API_KEY` 都能从线上 bundle 里读出来。把它们当"可轮换、有限额"的凭据管，不要当秘密；泄漏了就换，不要试图藏。
2. **env 只在 `.env.local`。** 模板是 `.env.example`（Vite 从不加载这个名字）。本仓曾跟踪过 `.env`，已退役并加进 `.gitignore`——不要重新提交 `.env`。
3. **本仓是 PUBLIC 的。** 任何写进仓库的东西都假定公开。
4. **不要顺手把视觉迁到 `@bitspv/tokens`。** 本仓有一套完整的 shadcn 变量体系（`--background` / `--foreground` / `--primary` / `--accent` …，340 处 `var()`），换 token 等于重画主题，需要单独决策。状态见 workspace 的 `docs/shared-infra.md`。
5. `build:offline` 出的是单文件离线版，改 CSP、资源路径、字体加载时要同时验它，否则线上正常、离线白屏。
6. **改 `index.html` 里的内联 `<script>` 必须同步重算 CSP 的 `sha256-…`**（`script-src` 里那个哈希就是它的白名单）。改了内容不换哈希，浏览器会静默拦掉这个脚本，表现为「中文用户看到英文标题」。重算方法：对 `<script>` 标签内的原文做 SHA-256，再 base64（`node -e` 见下），构建产物里哈希应保持一致。

## 已知

- 钱包逻辑只走 `src/hooks`（`useWallet` / `usePinManager` / `useStorage`）与 `src/utils`，不要在页面里绕过它们直接读写 localStorage。
- 这是 React，和主站（Vue）不共享组件——视觉一致靠 token，不靠组件。
- **第三方付款请求入口已永久下线，不要加回来**（`postMessage` / `callbackUrl` 那套）。原因不是"暂时关掉"：纯前端无法证明「谁付了多少、付给谁、只付这一次」，回传的 `payment_success` 只能证明「那个窗口说了这句话」。要做可信结果必须有服务端订单 + 上链核验。决策：工作区 `docs/decisions.md` W-007。
