import { createApp } from 'vue';
import { setupI18n } from '@vben/locales';
import { initStores, useAccessStore } from '@vben/stores';
import '@vben/styles';
import '@vben/styles/ele';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import App from './app.vue';
import { menus, router } from './router';
import './style.css';
export async function bootstrap() {
  const app = createApp(App);
  await setupI18n(app, { defaultLocale: 'zh-CN' });
  await initStores(app, { namespace: 'sdn-ui-preferences' });
  const access = useAccessStore();
  access.setAccessToken(null);
  access.setAccessMenus(menus);
  app.use(ElementPlus); app.use(router); app.mount('#app');
}
