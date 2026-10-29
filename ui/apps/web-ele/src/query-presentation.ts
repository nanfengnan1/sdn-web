const preferred: Record<string, string[]> = {
 IPS_STATUS: ['state','ruleCount','generation','pid','attachedInterfaces','baseConfigPath','baseConfigPending','baseConfigError','autoReload','lastError','logDirectory'],
 IPS_RULES: ['sid','rule','loaded','revision'],
  NEIGHBOR_KEEPALIVE_STATUS: ['enabled','vrf','bridge','interface','family','ip','mac','state','attempts','ageSeconds','nextProbeSeconds','intervalSeconds','targets','probes','confirmed','failed','send_errors','capacity_errors'],
  VXLAN_TUNNELS: ['name', 'vppName', 'swIfIndex', 'vni', 'family', 'local', 'port', 'encapVrfId', 'bridge', 'vrf', 'multipoint', 'remoteCount', 'bumCount'],
  INTERFACES: ['name', 'vppName', 'swIfIndex', 'kind', 'vrf', 'up', 'linkUp', 'mtu', 'mac'],
  FDB: ['bridge', 'vrf', 'mac', 'interface', 'swIfIndex', 'origin', 'static'],
  ROUTES: ['vrf', 'tableId', 'family', 'prefix', 'n_paths', 'paths'],
};
const labels: Record<string, string> = {
 baseConfigPath:'基础配置文件',baseConfigPending:'基础配置待加载',baseConfigError:'基础配置错误',autoReload:'自动重载',
 sid:'规则 SID',rule:'规则',loaded:'已加载',ruleCount:'规则数',generation:'加载代次',pid:'Snort PID',attachedInterfaces:'实际检查接口',lastError:'最近错误',logDirectory:'日志目录',revision:'配置版本',
  enabled:'邻居保活', ip:'IP 地址', state:'探测状态', attempts:'本轮尝试', ageSeconds:'距上次确认（秒）', nextProbeSeconds:'下次探测（秒）', intervalSeconds:'探测间隔（秒）', targets:'跟踪绑定', probes:'已发探测', confirmed:'确认次数', failed:'失联次数', send_errors:'发送错误', capacity_errors:'容量不足',
  name: '名称', vppName: 'VPP 接口', swIfIndex: '接口索引', vni: 'VNI', family: '地址族',
  encapVrfId: '外层 VRF 表 ID', local: '本地 VTEP', port: 'UDP 端口', bridge: 'BD', vrf: '租户 / VRF', multipoint: '多点接口',
  remoteCount: '远端 VTEP 数', bumCount: 'BUM 成员数', up: '管理状态', linkUp: '链路状态',
  mtu: 'MTU', mac: 'MAC', interface: '接口', origin: '来源', static: '静态', kind: '类型',
  tableId: 'FIB 表', prefix: '前缀', n_paths: '下一跳数', paths: '下一跳',
};
export function queryColumns(kind: string, vpp: boolean, records: Record<string, unknown>[]) {
  const keys = Array.from(new Set(records.flatMap(Object.keys)));
  const ordered = vpp && preferred[kind] ? preferred[kind].filter(k => keys.includes(k)) : keys.slice(0, 12);
  return ordered.map(key => ({ key, label: kind.startsWith('IPS_') && key === 'state' ? '运行状态' : vpp ? labels[key] || key : key }));
}
export function queryCell(value: unknown, key = '') {
  if (typeof value === 'boolean') return ['up', 'linkUp'].includes(key) ? (value ? 'UP' : 'DOWN') : (value ? '是' : '否');
  return value === null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
}
