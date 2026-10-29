import { createRouter, createWebHashHistory } from 'vue-router';
import { session } from './session';
export const menus = [{ name: '节点管理', path: '/nodes' },{ name: '租户与网络', path: '/desired' },{ name: 'IPS 配置', path: '/ips' },{ name: '配置变更', path: '/changes' },{ name: '任务中心', path: '/jobs' },{ name: '网络拓扑', path: '/topology' }];
export const router = createRouter({ history: createWebHashHistory(), routes: [
  { path: '/login', name: 'Login', component: () => import('./views/login.vue'), meta: { title: '连接控制台' } },
  { path: '/', component: () => import('./layout.vue'), redirect: '/nodes', children: [
    { path: 'nodes', name: 'Nodes', component: () => import('./views/nodes.vue'), meta: { title: '节点管理' } },
    { path: 'desired', name: 'Desired', component: () => import('./views/desired.vue'), meta: { title: '租户与网络' } },
    { path: 'ips', name: 'IPS', component: () => import('./views/ips.vue'), meta: { title: 'IPS 配置' } },
    { path: 'changes', name: 'Changes', component: () => import('./views/changes.vue'), meta: { title: '配置变更' } },
    { path: 'jobs', name: 'Jobs', component: () => import('./views/jobs.vue'), meta: { title: '任务中心' } },
    { path: 'topology', name: 'Topology', component: () => import('./views/topology.vue'), meta: { title: '网络拓扑' } },
  ] }, { path: '/:pathMatch(.*)*', redirect: '/nodes' },
] });
router.beforeEach((to) => { if (to.path !== '/login' && !session.role) return { path: '/login', query: { redirect: to.fullPath } }; if (to.path === '/login' && session.role) return '/nodes'; return true; });
router.afterEach((to) => { document.title = `${String(to.meta.title || '控制台')} · SDN Fabric`; });
