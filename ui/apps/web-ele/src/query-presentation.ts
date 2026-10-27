const preferred: Record<string, string[]> = {
  VXLAN_TUNNELS: ['name', 'vppName', 'swIfIndex', 'vni', 'family', 'local', 'port', 'bridge', 'vrf', 'multipoint', 'remoteCount', 'bumCount'],
  INTERFACES: ['name', 'vppName', 'swIfIndex', 'kind', 'vrf', 'up', 'linkUp', 'mtu', 'mac'],
  FDB: ['bridge', 'vrf', 'mac', 'interface', 'swIfIndex', 'origin', 'static'],
  ROUTES: ['vrf', 'tableId', 'family', 'prefix', 'n_paths', 'paths'],
};
const labels: Record<string, string> = {
  name: '名称', vppName: 'VPP 接口', swIfIndex: '接口索引', vni: 'VNI', family: '地址族',
  local: '本地 VTEP', port: 'UDP 端口', bridge: 'BD', vrf: '租户 / VRF', multipoint: '多点接口',
  remoteCount: '远端 VTEP 数', bumCount: 'BUM 成员数', up: '管理状态', linkUp: '链路状态',
  mtu: 'MTU', mac: 'MAC', interface: '接口', origin: '来源', static: '静态', kind: '类型',
  tableId: 'FIB 表', prefix: '前缀', n_paths: '下一跳数', paths: '下一跳',
};
export function queryColumns(kind: string, vpp: boolean, records: Record<string, unknown>[]) {
  const keys = Array.from(new Set(records.flatMap(Object.keys)));
  const ordered = vpp && preferred[kind] ? preferred[kind].filter(k => keys.includes(k)) : keys.slice(0, 12);
  return ordered.map(key => ({ key, label: vpp ? labels[key] || key : key }));
}
export function queryCell(value: unknown, key = '') {
  if (typeof value === 'boolean') return ['up', 'linkUp'].includes(key) ? (value ? 'UP' : 'DOWN') : (value ? '是' : '否');
  return value === null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
}
