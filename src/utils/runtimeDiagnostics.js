/**
 * Runtime security & integrity diagnostics.
 *
 * Produces:
 *   1. a short, quiet summary for the in-app log console that surfaces the
 *      *CSP outbound allowlist* (the set of domains the site may talk to) plus
 *      any issues,
 *   2. the full structured result, and
 *   3. a copyable plain-text report.
 *
 * Trust note: a page can only read the CSP it *itself* declares. A malicious
 * author could ship a permissive policy. So this check is about transparency
 * and change-detection (allowlist fingerprint), not an absolute guarantee.
 * The trust anchors are the open-source repo + pinning the fingerprint.
 */

import { EXPECTED_CSP_ORIGINS } from '../security/expectedCsp';

const IS_OFFLINE = import.meta.env.VITE_OFFLINE_BUILD === 'true';
const IS_DEV = import.meta.env.DEV;

/** @typedef {'pass' | 'fail' | 'warn' | 'skip'} CheckStatus */

export function getBuildInfo() {
  return {
    appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown',
    buildTime: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'unknown',
    sdkVersion: typeof __BSV_SDK_VERSION__ !== 'undefined' ? __BSV_SDK_VERSION__ : 'unknown',
    buildMode: typeof __BUILD_MODE__ !== 'undefined' ? __BUILD_MODE__ : import.meta.env.MODE,
    offline: IS_OFFLINE,
  };
}

function formatBuildTime(value) {
  if (!value || value === 'unknown') return 'unknown';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.toISOString().replace('T', ' ').slice(0, 19)}Z`;
}

function parseCsp(content) {
  const directives = {};
  content
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const tokens = part.split(/\s+/).filter(Boolean);
      if (tokens.length) directives[tokens[0].toLowerCase()] = tokens.slice(1);
    });
  return directives;
}

// --- CSP source classification & normalization ------------------------------

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** @returns {{ kind: string, value: string, host?: string, scheme?: string } | null} */
function classifySource(token) {
  const t = (token || '').trim();
  if (!t) return null;

  if (/^'.*'$/.test(t)) {
    const inner = t.slice(1, -1);
    if (/^sha(256|384|512)-/.test(inner)) return { kind: 'hash', value: inner };
    if (/^nonce-/.test(inner)) return { kind: 'nonce', value: inner };
    return { kind: 'keyword', value: t }; // 'self', 'unsafe-inline', 'none', ...
  }

  if (/^(data|blob|filesystem|mediastream):$/i.test(t)) {
    return { kind: 'scheme', value: t.toLowerCase() };
  }

  if (t === '*') return { kind: 'wildcard', value: '*', host: '*' };

  const m = t.match(/^([a-z][a-z0-9+.-]*):\/\/([^/]+)/i);
  if (m) {
    const scheme = m[1].toLowerCase();
    const host = m[2].toLowerCase();
    return {
      kind: host.startsWith('*.') ? 'wildcard' : 'origin',
      value: `${scheme}://${host}`,
      host,
      scheme,
    };
  }

  const host = t.split('/')[0].toLowerCase();
  return {
    kind: host.startsWith('*.') ? 'wildcard' : 'origin',
    value: `https://${host}`,
    host,
    scheme: 'https',
  };
}

function extractSources(tokens) {
  return (tokens || []).map(classifySource).filter(Boolean);
}

const isNetwork = (s) => s.kind === 'origin' || s.kind === 'wildcard';

function domainsOf(sources) {
  return [...new Set(sources.filter(isNetwork).map((s) => s.value))];
}

function compareSets(expected, actual) {
  const e = new Set(expected);
  const a = new Set(actual);
  return {
    added: actual.filter((x) => !e.has(x)),
    removed: expected.filter((x) => !a.has(x)),
  };
}

/** Short, stable fingerprint of a set of origins (any change → new value). */
async function fingerprint(values) {
  const norm = [...new Set(values)].sort().join('\n');
  const hex = await sha256Hex(norm);
  return hex ? hex.slice(0, 24) : null;
}

async function sha256Hex(text) {
  if (!globalThis.crypto?.subtle) return null;
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

async function sha256Base64(text) {
  if (!globalThis.crypto?.subtle) return null;
  try {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  } catch {
    return null;
  }
}

function notabilityOf(s) {
  if (!isNetwork(s)) return null;
  if (s.kind === 'wildcard' && s.host === '*') return '任意来源通配';
  if (s.host && s.host.includes('xn--')) return 'punycode 域名';
  if (s.scheme === 'http') return '非加密 http';
  if (s.host && IPV4.test(s.host)) return '裸 IP';
  return null;
}

/**
 * Scan every directive for notable sources. Split into:
 *   - notable:    punycode / raw IP / http / wildcard-any (always surfaced for transparency)
 *   - unexpected: the above that are NOT in the expected baseline (real warnings)
 */
function collectAnomalies(csp) {
  const expectedAll = new Set([
    ...(EXPECTED_CSP_ORIGINS['connect-src'] || []),
    ...(EXPECTED_CSP_ORIGINS['script-src'] || []),
  ]);
  const notable = [];
  const unexpected = [];
  for (const [directive, tokens] of Object.entries(csp)) {
    for (const s of extractSources(tokens)) {
      const label = notabilityOf(s);
      if (!label) continue;
      const item = { directive, value: s.value, label };
      notable.push(item);
      if (!expectedAll.has(s.value)) unexpected.push(item);
    }
  }
  return { notable, unexpected };
}

// --- Resource helpers (SRI / inline hashes) ---------------------------------

function isExecutableInlineScript(el) {
  if (el.getAttribute('src')) return false;
  const type = (el.getAttribute('type') || '').trim().toLowerCase();
  if (!type) return true;
  return [
    'module',
    'text/javascript',
    'application/javascript',
    'text/ecmascript',
    'application/ecmascript',
  ].includes(type);
}

function originOf(el) {
  try {
    return new URL(el.getAttribute('src'), location.href).origin;
  } catch {
    return null;
  }
}

function describeResource(el) {
  try {
    const u = new URL(el.getAttribute('src'), location.href);
    return `${u.origin}${u.pathname}`;
  } catch {
    return el.getAttribute('src') || '(unknown)';
  }
}

/** Is `origin` explicitly allowed by the CSP script-src directive? */
function isOriginAllowedByCsp(origin, scriptSrcTokens) {
  if (!origin) return false;
  return scriptSrcTokens.some((token) => {
    if (token === "'self'") return origin === location.origin;
    if (!/^https?:\/\//i.test(token)) return false;
    try {
      const allowed = new URL(token);
      if (allowed.origin === origin) return true;
      if (allowed.hostname.startsWith('*.')) {
        return origin.endsWith(allowed.hostname.slice(1));
      }
    } catch {
      /* ignore malformed token */
    }
    return false;
  });
}

// --- Checks -----------------------------------------------------------------

async function runChecks() {
  const checks = [];
  /** @param {CheckStatus} status */
  const add = (id, label, status, detail) => checks.push({ id, label, status, detail });

  // --- Wallet-critical foundations -----------------------------------------
  add(
    'secure-context',
    '安全上下文 (HTTPS / localhost)',
    window.isSecureContext ? 'pass' : 'fail',
    window.isSecureContext ? undefined : '非安全上下文，WebCrypto 与密钥操作可能不可用'
  );

  add(
    'webcrypto',
    'WebCrypto (crypto.subtle) 可用',
    globalThis.crypto?.subtle ? 'pass' : 'fail',
    globalThis.crypto?.subtle ? undefined : '缺少 crypto.subtle，签名/加密将无法运行'
  );

  add(
    'framing',
    '未被 iframe 嵌套 (防点击劫持)',
    window.self === window.top ? 'pass' : 'fail',
    window.self === window.top ? undefined : '页面被嵌入 iframe，存在点击劫持风险'
  );

  // --- Content Security Policy ---------------------------------------------
  const meta = document.querySelector('meta[http-equiv="Content-Security-Policy" i]');
  const csp = meta ? parseCsp(meta.getAttribute('content') || '') : null;
  let scriptSrc = [];
  let cspReport = null;

  if (!meta) {
    add('csp', 'CSP 策略存在', 'fail', '未找到 CSP meta，且无法从 JS 读取 HTTP 头');
  } else {
    add('csp', 'CSP 策略存在', 'pass', `${Object.keys(csp).length} 条指令`);

    const defaultSrc = csp['default-src'] || [];
    add(
      'csp-default-src',
      "default-src 限定为 'self'",
      defaultSrc.includes("'self'") ? 'pass' : 'warn',
      defaultSrc.includes("'self'") ? undefined : "default-src 未包含 'self'"
    );

    scriptSrc = csp['script-src'] || defaultSrc;

    // --- Outbound (data exfiltration) allowlist ---------------------------
    const outboundSources = extractSources(csp['connect-src'] || defaultSrc);
    const outboundDomains = domainsOf(outboundSources);
    const outboundCompare = compareSets(EXPECTED_CSP_ORIGINS['connect-src'] || [], outboundDomains);
    const outboundFp = await fingerprint(outboundDomains);

    add(
      'csp-connect-src',
      'CSP 出站白名单 (connect-src)',
      outboundCompare.added.length ? 'warn' : 'pass',
      `${outboundDomains.length} 个来源 · 指纹 sha256:${outboundFp}${
        outboundCompare.added.length ? ` · 新增: ${outboundCompare.added.join(', ')}` : ' · 与预期一致'
      }`
    );

    // --- Script execution allowlist ---------------------------------------
    const scriptSources = extractSources(scriptSrc);
    const scriptDomains = domainsOf(scriptSources);
    const scriptCompare = compareSets(EXPECTED_CSP_ORIGINS['script-src'] || [], scriptDomains);

    add(
      'csp-script-src',
      'CSP 脚本白名单 (script-src)',
      scriptCompare.added.length ? 'warn' : 'pass',
      `${scriptDomains.length} 个来源${scriptCompare.added.length ? ` · 新增: ${scriptCompare.added.join(', ')}` : ' · 与预期一致'}`
    );

    // --- Anomalous sources across all directives --------------------------
    const anomalies = collectAnomalies(csp);
    add(
      'csp-anomaly',
      'CSP 来源异常 (punycode / 裸 IP / http / 通配)',
      anomalies.unexpected.length ? 'warn' : 'pass',
      anomalies.unexpected.length
        ? anomalies.unexpected.map((a) => `${a.value}: ${a.label}`).join('；')
        : undefined
    );

    // --- Script-src strength ----------------------------------------------
    if (scriptSrc.includes("'unsafe-inline'")) {
      add(
        'csp-unsafe-inline',
        "script-src 禁止 'unsafe-inline'",
        IS_OFFLINE ? 'pass' : 'fail',
        IS_OFFLINE ? '离线单文件构建，属预期放宽' : "script-src 含 'unsafe-inline'，XSS 防护被削弱"
      );
    } else {
      add('csp-unsafe-inline', "script-src 禁止 'unsafe-inline'", 'pass');
    }

    if (scriptSrc.includes("'unsafe-eval'")) {
      add(
        'csp-unsafe-eval',
        "script-src 禁止 'unsafe-eval'",
        IS_OFFLINE ? 'pass' : 'warn',
        IS_OFFLINE ? '离线单文件构建，属预期放宽' : "script-src 含 'unsafe-eval'"
      );
    } else {
      add('csp-unsafe-eval', "script-src 禁止 'unsafe-eval'", 'pass');
    }

    if (IS_OFFLINE) {
      add('trusted-types', 'Trusted Types 强制 (require-trusted-types-for)', 'skip', '离线构建未启用');
    } else if ((csp['require-trusted-types-for'] || []).includes("'script'")) {
      add('trusted-types', 'Trusted Types 强制 (require-trusted-types-for)', 'pass');
    } else {
      add(
        'trusted-types',
        'Trusted Types 强制 (require-trusted-types-for)',
        'warn',
        "未设置 require-trusted-types-for 'script'"
      );
    }

    cspReport = {
      outbound: { domains: outboundDomains, compare: outboundCompare, fingerprint: outboundFp },
      scripts: { domains: scriptDomains, compare: scriptCompare },
      anomalies,
      directives: buildDirectiveReport(csp),
    };
  }

  // --- Subresource Integrity: external scripts only -------------------------
  const scripts = [...document.querySelectorAll('script[src]')];
  const external = scripts.filter((el) => {
    const origin = originOf(el);
    return origin && origin !== location.origin;
  });
  const missingSri = external.filter((el) => !el.getAttribute('integrity'));
  const unexpected = missingSri.filter((el) => !isOriginAllowedByCsp(originOf(el), scriptSrc));

  if (external.length === 0) {
    add('sri', '外部脚本完整性 (SRI)', 'pass', `无外部脚本（共 ${scripts.length} 个）`);
  } else if (missingSri.length === 0) {
    add('sri', '外部脚本完整性 (SRI)', 'pass', `${external.length} 个外部脚本均带 SRI`);
  } else if (unexpected.length === 0) {
    add(
      'sri',
      '外部脚本完整性 (SRI)',
      'pass',
      `${missingSri.length} 个外部脚本未带 SRI，但已被 CSP 信任：${missingSri
        .map(describeResource)
        .join(', ')}`
    );
  } else {
    add(
      'sri',
      '外部脚本完整性 (SRI)',
      'warn',
      `${unexpected.length} 个外部脚本缺少 SRI 且未被 CSP 允许：${unexpected
        .map(describeResource)
        .join(', ')}`
    );
  }

  // --- Inline script hash integrity (production only) -----------------------
  if (IS_DEV) {
    add('inline-integrity', '内联脚本哈希校验', 'skip', '开发模式跳过（dev server 会注入内联脚本）');
  } else if (!meta) {
    add('inline-integrity', '内联脚本哈希校验', 'skip', '无 CSP，无法比对');
  } else {
    const declared = (csp['script-src'] || [])
      .map((t) => t.replace(/^'|'$/g, ''))
      .filter((t) => /^sha(256|384|512)-/.test(t));
    const inline = [...document.querySelectorAll('script')].filter(
      (el) => isExecutableInlineScript(el) && (el.textContent || '').trim()
    );

    if (!inline.length) {
      add('inline-integrity', '内联脚本哈希校验', 'pass', '无内联脚本');
    } else {
      let mismatch = 0;
      for (const el of inline) {
        const digest = await sha256Base64(el.textContent || '');
        if (!digest) {
          add('inline-integrity', '内联脚本哈希校验', 'skip', 'WebCrypto 不可用');
          break;
        }
        if (!declared.includes(`sha256-${digest}`)) mismatch += 1;
      }
      if (mismatch) {
        add('inline-integrity', '内联脚本哈希校验', 'fail', `${mismatch} 个内联脚本与 CSP 哈希不匹配`);
      } else {
        add('inline-integrity', '内联脚本哈希校验', 'pass', `${inline.length} 个内联脚本哈希一致`);
      }
    }
  }

  return { checks, csp: cspReport };
}

function buildDirectiveReport(csp) {
  const out = {};
  for (const [directive, tokens] of Object.entries(csp)) {
    const sources = extractSources(tokens);
    if (!sources.length) continue;
    out[directive] = sources.map((s) => `${s.value} (${s.kind})`);
  }
  return out;
}

function collectEnvironment() {
  const tz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'unknown';
    }
  })();
  const standalone =
    window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true;

  return [
    ['URL', location.href],
    ['User-Agent', navigator.userAgent],
    ['语言 / 时区', `${navigator.language} / ${tz}`],
    ['屏幕', `${screen.width}x${screen.height} @${window.devicePixelRatio || 1}x`],
    ['网络', navigator.onLine ? 'online' : 'offline'],
    ['显示模式', standalone ? 'standalone (PWA)' : 'browser'],
    ['Service Worker', navigator.serviceWorker?.controller ? 'controlling' : 'none'],
  ];
}

/**
 * @returns {Promise<{ checks: any[], csp: any, issues: any[], passed: number, total: number,
 *   build: ReturnType<typeof getBuildInfo>, environment: string[][] }>}
 */
export async function collectDiagnostics() {
  const { checks, csp } = await runChecks();
  const issues = checks.filter((c) => c.status === 'fail' || c.status === 'warn');
  const total = checks.filter((c) => c.status !== 'skip').length;
  const passed = checks.filter((c) => c.status === 'pass').length;
  return {
    checks,
    csp,
    issues,
    passed,
    total,
    build: getBuildInfo(),
    environment: collectEnvironment(),
  };
}

const STATUS_ICON = { pass: '✅', warn: '⚠️', fail: '❌', skip: '➖' };

const shortHost = (origin) => origin.replace(/^https:\/\//, '');

/** Short, quiet summary for the log console: CSP allowlist + issue lines. */
export function formatAuditEntries(diag) {
  const entries = [];
  const { build, issues, passed, total, csp } = diag;

  entries.push({ type: 'info', message: '── 安全与完整性自检 ──' });
  entries.push({
    type: issues.length ? 'warn' : 'success',
    message: `安全校验：${passed}/${total} 通过${issues.length ? ` · ${issues.length} 项需关注` : ' · 无风险项'}`,
  });
  entries.push({
    type: 'info',
    message: `App ${build.appVersion} · BSV SDK ${build.sdkVersion} · 构建 ${formatBuildTime(
      build.buildTime
    )} · ${build.offline ? '离线版' : build.buildMode}`,
  });

  if (csp?.outbound) {
    entries.push({
      type: 'info',
      message: `🔒 CSP 出站 connect-src (${csp.outbound.domains.length})：${csp.outbound.domains
        .map(shortHost)
        .join(' · ')}`,
    });
    entries.push({
      type: 'info',
      message: `🔒 CSP 脚本 script-src (${csp.scripts.domains.length})：${csp.scripts.domains
        .map(shortHost)
        .join(' · ')}`,
    });

    if (csp.anomalies.unexpected.length) {
      entries.push({
        type: 'warn',
        message: `⚠️ CSP 未预期来源异常：${csp.anomalies.unexpected
          .map((a) => `${a.value} (${a.label})`)
          .join(' · ')}`,
      });
    } else if (csp.anomalies.notable.length) {
      entries.push({
        type: 'info',
        message: `ℹ️ CSP 备注（均为预期来源）：${csp.anomalies.notable
          .map((a) => `${a.value} (${a.label})`)
          .join(' · ')}`,
      });
    }

    const added = [...csp.outbound.compare.added, ...csp.scripts.compare.added];
    const removed = [...csp.outbound.compare.removed, ...csp.scripts.compare.removed];
    const fp = csp.outbound.fingerprint ? `sha256:${csp.outbound.fingerprint}` : 'n/a';
    let compareMsg = '与预期白名单一致 ✓';
    if (added.length) compareMsg = `⚠️ 新增未预期来源：${added.join(', ')}`;
    if (removed.length) compareMsg += `${added.length ? ' · ' : ''}较预期减少：${removed.join(', ')}`;
    entries.push({ type: added.length ? 'warn' : 'info', message: `出站白名单指纹 ${fp} · ${compareMsg}` });
  }

  // CSP details are already shown above; don't repeat them as issue lines.
  const cspInline = new Set(['csp-connect-src', 'csp-script-src', 'csp-anomaly']);
  issues
    .filter((issue) => !cspInline.has(issue.id))
    .forEach((issue) => {
      entries.push({
        type: issue.status === 'fail' ? 'error' : 'warn',
        message: `${STATUS_ICON[issue.status]} ${issue.label}${issue.detail ? ` — ${issue.detail}` : ''}`,
      });
    });

  return entries;
}

/** Full plain-text report for clipboard / bug reports. */
export function formatDiagnosticsReport(diag) {
  const { build, checks, environment, csp } = diag;
  const lines = [
    '# BitSPV 诊断报告',
    '> 注意：CSP 由页面自身声明，可被作者篡改。真正的信任锚是开源仓库 + 出站白名单指纹。',
    '',
    `- 生成时间: ${new Date().toISOString()}`,
    `- App 版本: ${build.appVersion}`,
    `- BSV SDK: ${build.sdkVersion}`,
    `- 构建时间: ${formatBuildTime(build.buildTime)}`,
    `- 构建模式: ${build.buildMode}${build.offline ? ' (离线单文件)' : ''}`,
  ];

  if (csp?.directives) {
    lines.push('', '## CSP 对外访问范围');
    for (const [directive, sources] of Object.entries(csp.directives)) {
      lines.push(`- ${directive} (${sources.length}): ${sources.join(', ')}`);
    }
    if (csp.outbound?.fingerprint) {
      lines.push('', `出站白名单指纹: sha256:${csp.outbound.fingerprint}`);
      lines.push(`  新增(非预期): ${csp.outbound.compare.added.join(', ') || '无'}`);
      lines.push(`  减少(预期缺失): ${csp.outbound.compare.removed.join(', ') || '无'}`);
      lines.push(`  脚本新增(非预期): ${csp.scripts.compare.added.join(', ') || '无'}`);
    }
    if (csp.anomalies) {
      lines.push('', '## CSP 来源异常');
      lines.push(
        `- 未预期: ${
          csp.anomalies.unexpected.map((a) => `${a.value} (${a.label})`).join(' · ') || '无'
        }`
      );
      lines.push(
        `- 备注(预期内): ${
          csp.anomalies.notable.map((a) => `${a.value} (${a.label})`).join(' · ') || '无'
        }`
      );
    }
  }

  lines.push(
    '',
    '## 安全检查',
    ...checks.map(
      (c) => `${STATUS_ICON[c.status]} [${c.id}] ${c.label}${c.detail ? ` — ${c.detail}` : ''}`
    ),
    '',
    '## 环境',
    ...environment.map(([k, v]) => `- ${k}: ${v}`)
  );
  return lines.join('\n');
}

/** Run the audit and pipe the short summary into a LogContext `addLog`. */
export async function logSecurityAudit(addLog) {
  if (typeof addLog !== 'function') return null;
  const diag = await collectDiagnostics();
  formatAuditEntries(diag).forEach((entry) => addLog(entry.message, entry.type));
  return diag;
}
