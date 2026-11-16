#!/usr/bin/env node
/**
 * 生成 shadcn 需要的 HSL 变量，值全部来自 @bitspv/tokens。
 *
 *   node scripts/gen-brand-vars.mjs
 *
 * 为什么要有这一层：
 * - 品牌 token 是 hex + 语义名（paper / ink / rule / accent…）；
 * - shadcn 组件消费的是 `hsl(var(--primary))` 这种三元组，名字也是另一套。
 * 手抄 hex 会漂，所以 predev / prebuild 从 tokens.json 重新算一遍。
 *
 * 注意两处同名不同义：
 * - 品牌 `accent`（唯一动作色）→ shadcn `--primary`；
 * - shadcn `--accent` 只是 hover 弱底 → 品牌 `paper-2`。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/styles/brand-vars.css');

const tokens = JSON.parse(fs.readFileSync(require.resolve('@bitspv/tokens/tokens.json'), 'utf8'));

const themes = tokens.color.themes.map((t) => t.id);
const LIGHT = themes[0];
const DARK = themes[1] ?? themes[0];

const readToken = (name, theme) => {
  const token = tokens.color.tokens.find((t) => t.name === name);
  if (!token) throw new Error(`[gen-brand-vars] 品牌 token 里没有 "${name}"`);
  return token.value[theme] ?? token.value[LIGHT];
};

/** #rrggbb → "H S% L%"（shadcn 要的三元组，不带 hsl()） */
const toHslTriplet = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

/** shadcn 变量 → 品牌 token 名 */
const MAP = {
  '--background': 'paper',
  '--card': 'paper',
  '--popover': 'paper',
  '--foreground': 'ink',
  '--card-foreground': 'ink',
  '--popover-foreground': 'ink',
  '--primary': 'accent',
  '--primary-foreground': 'on-accent',
  '--secondary': 'paper-2',
  '--secondary-foreground': 'ink',
  '--muted': 'paper-2',
  '--muted-foreground': 'ink-3',
  '--accent': 'paper-2',
  '--accent-foreground': 'ink',
  '--destructive': 'danger',
  '--border': 'rule',
  '--input': 'rule',
  '--ring': 'accent',
};

const block = (theme) =>
  Object.entries(MAP)
    .map(([cssVar, token]) => `  ${cssVar}: ${toHslTriplet(readToken(token, theme))};`)
    .join('\n');

const radiusToken = tokens.radius?.tokens?.find((t) => t.name === 'radius-sm');
const radius = radiusToken?.value ?? '2px';

const css = `/* Generated from @bitspv/tokens by scripts/gen-brand-vars.mjs. Do not edit.
 * 品牌规则：Personal/bitspv/design/brand-system/README.md
 * 动作色走 --primary（品牌 accent）；shadcn 的 --accent 只是 hover 弱底。
 */

:root {
${block(LIGHT)}
  --destructive-foreground: ${toHslTriplet(readToken('paper', LIGHT))};
  --radius: ${radius};
}

@media (prefers-color-scheme: dark) {
  :root {
${block(DARK)
  .split('\n')
  .map((line) => `  ${line}`)
  .join('\n')}
    --destructive-foreground: ${toHslTriplet(readToken('paper', DARK))};
  }
}
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, css);
console.log(`brand-vars.css → ${path.relative(process.cwd(), OUT)}`);
