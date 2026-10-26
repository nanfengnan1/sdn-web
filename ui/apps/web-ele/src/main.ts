import { initPreferences } from '@vben/preferences';
import { preferences } from './preferences';
async function start() {
  await initPreferences({ namespace: 'sdn-web-v1', overrides: preferences });
  const { bootstrap } = await import('./bootstrap');
  await bootstrap();
}
start().catch((error: unknown) => { document.getElementById('app')!.textContent = `控制台启动失败：${String(error)}`; });
