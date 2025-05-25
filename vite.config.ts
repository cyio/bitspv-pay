import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createHtmlPlugin } from 'vite-plugin-html';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';
// import { visualizer } from 'rollup-plugin-visualizer';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      vue(),
      // visualizer({
      //   open: true, // 在默认浏览器中打开分析报告
      //   gzipSize: true, // 显示 gzip 压缩后的大小
      //   brotliSize: true, // 显示 brotli 压缩后的大小
      //   filename: 'dist/stats.html', // 分析报告输出的文件名
      // }) as any, // TypeScript 类型断言
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'BitSPV',
          short_name: 'BitSPV',
          description: 'Bitcoin Satoshi (Payment) Vision',
          theme_color: '#ffffff',
          icons: [
            {
              src: path.resolve('/logo-b.png'), // 指定 logo 路径
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: path.resolve('/logo-b.png'),
              sizes: '512x512',
              type: 'image/png',
            },
          ],
          prefer_related_applications: true, // 告诉浏览器不推荐安装，尽量用原生应用
          related_applications: [],
        },
        workbox: {
          // navigateFallbackDenylist: [
          //   // 只排除带参数的 /index.html，如 /index.html?a=1
          //   /^\/index\.html\?.+/,
          // ],
        },
        devOptions: {
          enabled: false,
        },
      }),
      createHtmlPlugin({
        pages: [
          {
            entry: 'src/main.js',
            filename: 'index.html',
            template: 'index.html',
          },
        ],
        minify: false,
      }),
    ],
    server: {
      port: 5175, // 设置默认端口为 5175
      // 增加了额外的安全层，限制了跨域资源的加载和交互方式
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      proxy: {
        '/api-taal': {
          target: 'https://api.taal.com/v1',
          changeOrigin: true,
          // 注意这里要匹配 /api-taal 前缀
          rewrite: path => path.replace(/^\/api-taal/, ''),
        },
        '/api-arc': {
          target: 'https://arc.taal.com/v1',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api-arc/, ''),
          configure: (proxy, options) => {
            // proxy.on('proxyReq', req, res) => {
            //   console.log(`[Proxy /api-arc] Requesting: ${req.method} ${proxyReq.path}`);
            //   console.log('[Proxy /api-arc] Headers:', proxyReq.getHeaders());
            // });
            // proxy.on('proxyRes', (proxyRes, req, res) => {
            //   console.log(`[Proxy /api-arc] Received response: ${proxyRes.statusCode}`);
            // });
            proxy.on('error', (err, req, res) => {
              console.error('[Proxy /api-arc] Error:', err);
            });
          },
        },
        // '/api-bitail': {
        //   target: 'https://api.bitail.com',
        //   changeOrigin: true,
        //   secure: false,
        //   rewrite: path => path.replace(/^\/api-bitail/, ''),
        // },
      },
    },
    optimizeDeps: { esbuildOptions: { target: 'esnext' } }, // <-- Set this to resolve dev issue.
    build: {
      target: 'ES2022',
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'), // 设置 @ 指向 src 目录
      },
    },
    define: {
      __PRIV_KEY__: JSON.stringify(env.VITE_PRIV_KEY),
    },
  };
});
