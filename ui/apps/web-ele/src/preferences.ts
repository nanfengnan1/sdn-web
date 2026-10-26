import { defineOverridesPreferences } from '@vben/preferences';
export const preferences = defineOverridesPreferences({
  app: { name: 'SDN Fabric', defaultHomePath: '/nodes', enableCheckUpdates: false, enablePreferences: false, layout: 'sidebar-nav', locale: 'zh-CN' },
  theme: { mode: 'light', colorPrimary: 'hsl(172 66% 28%)', semiDarkSidebar: true },
  logo: { source: '/sdn.svg' }, copyright: { enable: false },
  tabbar: { enable: false, keepAlive: false, persist: false },
  widget: { notification: false, globalSearch: false, lockScreen: false, languageToggle: false, timezone: false, fullscreen: false, refresh: false },
  shortcutKeys: { enable: false }, transition: { enable: false, loading: false },
});
