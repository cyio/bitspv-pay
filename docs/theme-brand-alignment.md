# 主题对齐品牌：实施方案

> 状态：**A / B 两批均已执行（2026-11-16）**。
> 目标：把 `pay.bitspv.com` 的视觉收进品牌系统，但**不重做外壳结构**（完整外壳重做是品牌 README 里的 P4，5 人日，不在本文范围）。
> 品牌依据：`@bitspv/tokens@0.1.3`、`design/brand-system/README.md`。

---

## 0. 执行结果（A 批，2026-11-16）

已落地，实测值：

| 项 | 结果 |
|---|---|
| 暗色 | `darkMode: 'media'`；亮 `rgb(31,31,31)` 底 / `rgb(204,204,204)` 字 / 薄荷 `#45e0a0` 动作色 |
| 动作色 | `--primary: 159 91% 25%`（亮）/ `155 71% 57%`（暗），蓝色与 `indigo-*` 清零 |
| 圆角 / 阴影 | `--radius: 2px`；产品 UI 内 `shadow-*` 清零 |
| 字族 | `system-ui` 系统栈；`font-variant-numeric: tabular-nums` 生效 |
| 生成方式 | `scripts/gen-brand-vars.mjs` → `src/styles/brand-vars.css`，`predev` / `prebuild` 自动跑 |

与方案的三处偏差：

1. **字族不用「删掉 Inter」描述**：`Inter` 从未被加载，实际动作是 `font-family` 换成 `var(--font-sans)` 并引入 `@bitspv/tokens/tokens.css`。
2. **`gray-*` 一次清完**，不只页面级——只改页面容器会让同一屏出现系统自带灰与品牌灰并存，比不改更花。
3. **`src/components/ui/*` 的 `shadow-sm/md/lg` 一并去掉**：对话框是可见界面，留着就等于没做。
4. `DebugConsole`（开发者日志浮层，恒为深色）保留原灰度与 `text-blue-300`，不属于产品 UI。

B 批修正：外部动作/次要动作在主流程里**本来就已经分好主次**（`Payment.jsx` 每个分支都是实心 + 描边各一个），原方案里「两个实心按钮并排」不成立。剩 B 批真实待办只有：贴顶与 640px 宽度、标题层级（14px → 15px ink）、页脚信任条。

---

## 1. 现状

### 1.1 暗色模式实际上没有生效

`tailwind.config.js` 是 `darkMode: ['class']`，但全仓**没有任何地方往 `<html>` 加 `.dark`**（`src/i18n.js` 只设 `lang`）。后果：

- 108 处 `dark:` 变体是死代码；
- `src/style.css` 顶部 Vite 模板遗留的 `:root { background-color: #242424; color: rgba(255,255,255,.87) }` 仍在生效，系统为暗色的用户看到的是**深灰页面底 + 白色卡片**。

### 1.2 与品牌的差距

| 维度 | 现在 | 品牌 |
|---|---|---|
| 动作色 | `#3B82F6` 蓝，22 处硬编码 `blue-*` | `accent` `#067A52` / 暗 `#45E0A0`，全站唯一动作色 |
| 字族 | `:root` 写死 `Inter, system-ui, ...` | 单一系统无衬线栈 |
| 数字 | 11 处 `font-mono` | 同一套字族 + `tabular-nums` |
| 圆角 / 阴影 | `--radius: 0.5rem`（8px）+ 9 处 `shadow-*` | 2px、无阴影 |
| 底色 | Tailwind 原生 `gray-*`，108 处 | `paper` / `paper-2` / `ink` / `rule` |
| 主按钮 | `Payment.jsx:329` 与 `:344` 两个实心并排 | 一屏只有一个实心 |

> **注意**：`Inter` 从来没有被加载过（`index.html` 无字体 `<link>`，也没有 webfont 文件），页面一直走 `system-ui` 回退。所以字族这项是**删掉一个无效的名字**，不是视觉变更。

---

## 2. 批次 A：token 与形状（1.5 人日）

不动任何组件结构，只换值。

### A1. 修暗色

- `tailwind.config.js`：`darkMode: ['class']` → `'media'`（品牌：跟随系统；页脚切换器留到 P4）
- `src/style.css`：删掉模板遗留——`color-scheme`、`background-color: #242424`、`color: rgba(255,255,255,.87)`、`a { color: #646cff }`、`a:hover { #535bf2 }`、`h1 { font-size: 3.2em }`、`.card`、`@media (prefers-color-scheme: light)` 块
- 保留 `.dark {}` 变量块本身（将来加切换器时直接用）

### A2. 引入品牌 token（不手抄 hex）

新增 `scripts/gen-brand-vars.mjs`：读 `@bitspv/tokens/tokens.json`，产出 `src/styles/brand-vars.css`，把品牌 hex 换算成 shadcn 需要的 HSL 三元组。`predev` / `prebuild` 自动执行，和主站 `gen:tokens` 同一套路。

| shadcn 变量 | 品牌 token | light | dark |
|---|---|---|---|
| `--background` / `--card` / `--popover` | `paper` | `0 0% 100%` | `0 0% 12%` |
| `--foreground` | `ink` | `0 0% 23%` | `0 0% 80%` |
| `--primary` | **`accent`** | `159 91% 25%` | `155 71% 57%` |
| `--primary-foreground` | `on-accent` | `0 0% 100%` | `163 79% 8%` |
| `--secondary` / `--muted` / `--accent` | `paper-2` | `0 0% 95%` | `0 0% 15%` |
| `--muted-foreground` | `ink-3` | `0 0% 42%` | `0 0% 62%` |
| `--border` / `--input` | `rule` | `0 0% 90%` | `0 0% 17%` |
| `--ring` | `accent` | `159 91% 25%` | `155 71% 57%` |
| `--destructive` | `danger` | `10 86% 42%` | `3 93% 63%` |
| `--radius` | `radius-sm` | `2px` | — |

**关键**：shadcn 的 `--accent` 是 hover 弱底，**不是**品牌 accent，两者只是同名。品牌的 accent 走 `--primary`。post 仓曾因这两个语义撞车而无法直接迁移，pay 不要重犯。

### A3. 22 处 `blue-*` 分类替换

| 用途 | 位置 | 替换为 |
|---|---|---|
| 实心动作 | `Dialogs:11`、`PinDialog:30`、`Payment:329/344`、`TransactionHistory:140` | `bg-primary text-primary-foreground hover:bg-primary/90` |
| 文字链接 | `Dialogs:133`、`TransactionHistory:116`、`PaymentAbout:52/62`、`PinDialog:223`、`AirGapFlow:345` | `text-primary underline` |
| 选中态 | `SettingsModal:34` | `border-primary bg-primary/10 text-primary` |
| 加载圈 | `TransactionHistory:64`、`AirGapFlow:546`、`Payment:357` | `border-primary` |
| 成功 / 已广播 | `AirGapFlow:311`、`WalletManager:640` | `text-seal` |
| 开发控制台 | `DebugConsole:104` | `text-primary` |

### A4. 形状与字族

- `--radius: 2px`；`tailwind.config.js` 的 `md` / `sm` 直接写 `2px`，不用 `calc()`（`2px - 4px` 是负数）
- 9 处 `shadow-*` → `border border-border`；`DebugConsole` 是开发工具，保留
- `src/style.css` 的 `font-family: Inter, system-ui, ...` → `font-family: var(--font-sans)`，并加 `font-variant-numeric: tabular-nums`
- 名称不变、PWA `theme_color` 已经是 `#ffffff`，不用动

### A5. `gray-*` 收敛（先页面级）

108 处一次性改风险太高，第一批只改页面容器：`Payment.jsx`、`Dialogs.jsx`、`PinDialog.jsx`、`SettingsModal.jsx`。

| 现在 | 改为 |
|---|---|
| `text-gray-500 / 400`（正文辅助） | `text-muted-foreground` |
| `text-gray-900 / 800`（标题） | `text-foreground` |
| `bg-gray-50 / 100`（次级面） | `bg-muted` |
| `border-gray-200 / 700` | `border-border` |
| `bg-white / dark:bg-gray-800` | `bg-card` |

组件内部（`WalletManager`、`AirGapFlow`、`TransactionHistory`）放第二批复查。

---

## 3. 批次 B：壳（已执行，2026-11-16）

- **贴顶 + Utility 密度**：整页 `bg-background`，中间 `max-w-[640px]` 的壳纵向撑满（`sm:border-x`），不再是浮在灰底上的 448px 卡片
- **app shell 三段**：`header` 56px 级（标题 + 副标题 + 4 个图标按钮，底部 1px rule）→ `main`（`flex-1`）→ `footer`（顶部 1px rule）
- **标题层级**：产品名 14px 灰 → **15px / 500 / ink**；副标题 11px → **12px / muted**
- **页脚信任条**：`非托管 · 私钥不离开设备 · 交易可查`（en: `Non-custodial · Keys never leave your device · Every transaction verifiable`），在链接行之上，11px muted
- **行内状态**：初始化错误从「红底红框」改成品牌规定的「2px 左线 + 小字」
- **状态 chip**：watch-only 徽标从 Tailwind amber 改用 `warn` / `warn-border` / `warn-soft` token
- 图标按钮加了 `p-1.5` 点击区与 hover 过渡

原方案里的「两个并排实心按钮」不成立：主流程每个分支本来就是实心 + 描边各一个，无需改动。

---

## 4. 不做的

- 完整外壳重做（header/footer/密度体系/状态 chip）—— 品牌 P4，单独评估
- 引入任何 webfont（含 `@fontsource`）：`file://` 下的离线版加载不到，且会让 `src/security/expectedCsp.js` 的指纹与运行时自检对不上
- 改产品名、改域名、改离线产物名

---

## 5. 验收

```bash
grep -rc "blue-" src --include=*.jsx | grep -v ":0"   # 应为空
grep -rn "shadow-" src --include=*.jsx                # 只剩 DebugConsole
grep -rn "gray-" src/components/{WalletManager,AirGapFlow,TransactionHistory}.jsx  # 批次 B 后清空
pnpm build                                            # 唯一门禁
```

- 亮 / 暗两套都截图对比一次；暗色下不再出现深底白卡
- `/address` 类数据页：金额、地址、txid 用 `tabular-nums` 仍对齐（主站已验证同一套 token）
- 离线单文件版：`pnpm build:offline` 后本地打开，确认无外链请求、样式与在线版一致
- 对比度：accent on paper 5.44:1，ink on paper 16.2:1（token 已标注）

---

## 6. 回滚

每批一个 commit，只碰类名与 token，不碰逻辑；回滚即 revert。`src/hooks`、`src/utils`、`src/security` 不在改动范围内。
