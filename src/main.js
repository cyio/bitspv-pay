import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import '@/style.css';
import App from '@/views/Payment.vue';
import VueGtag from 'vue-gtag-next';
import i18n from '@/i18n';
import { useIsSmallScreen } from '@/composables/useIsSmallScreen.js'; // 引入自定义 hook

const app = createApp(App);

// 全局注册插件
app.use(VueGtag, {
  property: {
    id: 'G-924QNFV4HX',
  },
});

const isSmallScreen = useIsSmallScreen(600); // 传入指定的宽度（768px）
app.provide('isSmallScreen', isSmallScreen);

app.use(i18n);
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'BSVMicroPay',
      component: App, // 直接使用 Payment.vue 作为根组件
      meta: {
        title: 'BitSPV - Bitcoin Satoshi Payment Vision',
        description: i18n.global.t('bsvPayment.description'),
        hideFooter: true
      },
    }
  ]
});

router.beforeEach((to, from, next) => {
  const title = to.meta.title;
  if (title) {
    document.title = title;
  }

  const oldWebPageScript = document.getElementById('webpage-json-ld');
  if (oldWebPageScript) {
    oldWebPageScript.remove();
  }

  if (title && to.meta.description) {
    const webPageScript = document.createElement('script');
    webPageScript.type = 'application/ld+json';
    webPageScript.id = 'webpage-json-ld';
    webPageScript.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      url: window.location.origin + to.fullPath,
      description: to.meta.description,
      isPartOf: {
        '@type': 'WebSite',
        url: window.location.origin,
        name: 'BitSPV - Bitcoin Satoshi Payment Vision',
      },
    });
    document.head.appendChild(webPageScript);
  }
  next();
});

app.use(router);

app.mount('#app'); // 挂载到新的 #app 元素上
