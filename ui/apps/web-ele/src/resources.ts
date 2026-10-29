import type { Node, Operation } from './types';

export type ResourceSection = 'tenant' | 'bridge' | 'interface' | 'vxlan' | 'bgp' | 'ospf' | 'ips';
export type ResourceCategory = 'tenant' | 'bridge' | 'interface' | 'tunnel' | 'routing' | 'ips';
export type FieldValue = string | number | boolean | undefined;
export interface ResourceField {
  key: string; label: string; type?: 'number' | 'boolean' | 'list' | 'select' | 'rule';
  feature?: string; required?: boolean; min?: number; max?: number; hint?: string; options?: { label: string; value: string }[];
  reference?: 'tenant' | 'bridge' | 'interface' | 'vxlan'; default?: FieldValue;
}
export interface ResourceAction {
  id: string; title: string; section: ResourceSection; code: string; action: string; data: string;
  fields: ResourceField[]; feature?: string; description?: string; identity?: string[];
}
export const resourceCategories: { id: ResourceCategory; label: string }[] = [
  { id: 'tenant', label: '租户与网络' }, { id: 'bridge', label: '二层网络 BD' },
  { id: 'interface', label: '接口' }, { id: 'tunnel', label: '隧道' },
  { id: 'routing', label: '路由' }, { id: 'ips', label: 'IPS' },
];
export const sections: { id: ResourceSection; category: ResourceCategory; label: string; description: string }[] = [
 { id: 'ips', category: 'ips', label: 'Snort IPS', description: '管理 Snort3 规则与 VPP 接口绑定。提交后校验配置并热重载；绑定接口前请确认规则和流量方向。仅检查经过三层接口/BVI 的 IPv4/IPv6 流量，纯二层转发不适用。绑定变更会短暂切换接口 Up/Down；Snort 断连时已绑定方向丢弃流量。' },
  { id: 'tenant', category: 'tenant', label: '租户与网络', description: '管理 VRF、L3VNI 与 BD 的租户归属，查看租户网络关系。' },
  { id: 'bridge', category: 'bridge', label: '二层网络 BD', description: '管理 BD 属性、成员接口与 ARP / ND 抑制；VXLAN 加入或移出 BD 在此配置。接口地址请到“接口”配置。' },
  { id: 'interface', category: 'interface', label: '接口', description: '管理接口状态、MTU、MAC 和 IPv4 / IPv6 地址，包括 BD 的三层地址。路由与协议请到“路由”配置。' },
  { id: 'vxlan', category: 'tunnel', label: 'VXLAN', description: '当前开放 VXLAN 隧道：创建或删除隧道，设置 VNI、VTEP 与 Underlay；支持 VPP 外层 VRF 修改。成员归属请到“二层网络 BD”配置。' },
  { id: 'bgp', category: 'routing', label: 'BGP', description: '管理 BGP 实例、邻居和地址族，包括 EVPN 发布与运行状态查询。' },
  { id: 'ospf', category: 'routing', label: 'OSPF', description: '管理 OSPFv2 / OSPFv3 实例、协议接口及网段。接口地址请到“接口”配置。' },
];
export const routingSections = sections.filter(section => section.category === 'routing');
export const tunnelSections = sections.filter(section => section.category === 'tunnel');
const name = (label = '名称', reference?: ResourceField['reference']): ResourceField => ({ key: 'name', label, required: true, reference });
const num = (key: string, label: string, min = 1, max = 4294967295, required = true): ResourceField => ({ key, label, type: 'number', required, min, max });
const str = (key: string, label: string, required = true): ResourceField => ({ key, label, required });
const bool = (key: string, label: string): ResourceField => ({ key, label, type: 'boolean' });
const ref = (key: string, label: string, reference: ResourceField['reference']): ResourceField => ({ key, label, required: true, reference });
const bgp = [num('asn', '本地 ASN'), { ...str('vrf', 'VRF（留空表示默认实例）', false), reference: 'tenant' as const }];
const peer = [...bgp, str('name', '邻居地址 / 邻居组名称')];
const bridgeFields = [name('BD 名称', 'bridge'), bool('stp', 'STP'), num('mtu', 'MTU', 68, 65535, false), str('mac', 'MAC 地址', false), num('ageingTime', 'MAC 老化计时值（clock_t）', 0, 4294967295, false)];
const rts: ResourceField[] = [
  { key: 'importRts', label: '导入 RT', type: 'list', hint: '逗号或换行分隔，如 65000:10010' },
  { key: 'exportRts', label: '导出 RT', type: 'list', hint: '逗号或换行分隔' },
];
const portFields = [ref('bridge', 'BD', 'bridge'), ref('port', '成员接口 / VXLAN', 'interface')];
const family: ResourceField = { key:'family', label:'地址族', type:'select', required:true, default:'IPV4', options:[{label:'IPv4 Unicast',value:'IPV4'},{label:'IPv6 Unicast',value:'IPV6'}] };
const vrf: ResourceField = { ...str('vrf','VRF（留空表示默认实例）',false), reference:'tenant' };
const encapVrf: ResourceField = { ...num('encapVrfId', '外层 VRF 表 ID', 0, 4294967294, false), feature: 'vxlan-encap-vrf/v1', default: 0, hint: '0 使用默认承载路由表。非零值需先准备该 VRF 的底层接口、VTEP 可达性及 Linux 控制映射；与租户 VRF 独立。' };
const actions: ResourceAction[] = [
  { id: 'tenant-create', title: '创建租户 VRF', section: 'tenant', code: 'TENANT', action: 'CREATE', data: 'tenant', fields: [name('租户 VRF 名称'), num('tableId', '路由表编号')], description: '只创建 VRF；BD、L3VNI 和路由协议分别配置。' },
  { id: 'tenant-delete', title: '删除租户 VRF', section: 'tenant', code: 'TENANT', action: 'DELETE', data: 'tenant', fields: [name('租户 VRF 名称', 'tenant')], description: '被 BD、L3VNI 或协议引用的 VRF 需要先解除引用。' },
  { id: 'tenant-l3-bind', title: '绑定 L3VNI', section: 'tenant', code: 'TENANT_L3VNI', action: 'BIND', data: 'l3vni', fields: [ref('tenant', '租户 VRF', 'tenant'), num('vni', 'L3VNI', 1, 16777215)], description: '已有三层 BD / VXLAN 关系必须满足绑定条件，不自动创建隧道。' },
  { id: 'tenant-l3-unbind', title: '解绑 L3VNI', section: 'tenant', code: 'TENANT_L3VNI', action: 'UNBIND', data: 'l3vni', fields: [ref('tenant', '租户 VRF', 'tenant')] },
  { id: 'bridge-create', title: '创建 BD', section: 'bridge', code: 'BD', action: 'CREATE', data: 'bridge', fields: bridgeFields },
  { id: 'bridge-set', title: '修改 BD 属性', section: 'bridge', code: 'BD', action: 'SET', data: 'bridge', fields: bridgeFields },
  { id: 'bridge-delete', title: '删除 BD', section: 'bridge', code: 'BD', action: 'DELETE', data: 'bridge', fields: [name('BD 名称', 'bridge')] },
  { id: 'bridge-vrf-bind', title: 'BD 加入租户', section: 'tenant', code: 'BD_TENANT', action: 'BIND', data: 'binding', fields: [ref('bridge', 'BD', 'bridge'), ref('tenant', '租户 VRF', 'tenant')] },
  { id: 'bridge-vrf-unbind', title: 'BD 移出租户', section: 'tenant', code: 'BD_TENANT', action: 'UNBIND', data: 'binding', fields: [ref('bridge', 'BD', 'bridge')] },
  { id: 'bridge-port-bind', title: 'BD 添加成员接口', section: 'bridge', code: 'BD_PORT', action: 'BIND', data: 'bridgePort', fields: [...portFields, bool('learning', 'MAC 学习'), bool('neighSuppress', 'ARP / ND 抑制')] },
  { id: 'bridge-port-unbind', title: 'BD 移除成员接口', section: 'bridge', code: 'BD_PORT', action: 'UNBIND', data: 'bridgePort', fields: portFields },
  { id: 'bridge-port-set', title: '成员学习 / ARP-ND 抑制', section: 'bridge', code: 'BD_PORT', action: 'SET', data: 'bridgePort', fields: [...portFields, bool('learning', 'MAC 学习'), bool('neighSuppress', 'ARP / ND 抑制')], description: '邻居抑制不等于主动 ARP/ND 探测保活。' },
  { id: 'interface-set', title: '修改接口属性', section: 'interface', code: 'INTERFACE', action: 'SET', data: 'interface', fields: [name('接口', 'interface'), bool('up', '管理状态 Up'), num('mtu', 'MTU', 68, 65535, false), str('mac', 'MAC 地址', false)] },
  { id: 'address-create', title: '接口 / BD 添加地址', section: 'interface', code: 'ADDRESS', action: 'CREATE', data: 'address', fields: [ref('interface', '接口 / BD', 'interface'), { ...str('prefix', 'IPv4 / IPv6 地址及前缀'), hint: '如 192.168.10.254/24 或 2001:db8:10::1/64' }] },
  { id: 'address-delete', title: '接口 / BD 删除地址', section: 'interface', code: 'ADDRESS', action: 'DELETE', data: 'address', fields: [ref('interface', '接口 / BD', 'interface'), str('prefix', 'IPv4 / IPv6 地址及前缀')] },
  { id: 'vxlan-create', title: '创建 VXLAN', section: 'vxlan', code: 'VXLAN', action: 'CREATE', data: 'vxlan', fields: [name('VXLAN 接口名'), num('vni', 'VNI', 1, 16777215), str('local', '本地 VTEP 地址'), { ...num('port', 'UDP 端口', 1, 65535), default: 4789 }, bool('learning', '隧道动态 MAC 学习'), encapVrf, { ...str('underlay', 'Underlay 接口', false), reference: 'interface' }] },
  { id: 'vxlan-encap-vrf-set', title: '修改 VXLAN 外层 VRF', section: 'vxlan', code: 'VXLAN', action: 'SET', data: 'vxlan', feature: 'vxlan-encap-vrf/v1', fields: [name('VXLAN 接口名', 'vxlan'), { ...encapVrf, required: true }, { ...str('underlay', '新的 Underlay 接口（可选）', false), reference: 'interface' }], description: '保留 VXLAN 接口、VNI 和 BD 绑定。外层 VRF 必须存在；显式 Underlay 接口需已属于目标 VRF。提交候选后切换承载路径，可能短暂影响通信。' },
  { id: 'vxlan-delete', title: '删除 VXLAN', section: 'vxlan', code: 'VXLAN', action: 'DELETE', data: 'vxlan', fields: [name('VXLAN 接口名', 'vxlan')] },
  { id: 'bgp-create', title: '创建 BGP 实例', section: 'bgp', code: 'BGP_INSTANCE', action: 'CREATE', data: 'bgp', fields: [...bgp, str('routerId', 'Router ID'), bool('defaultIpv4Unicast', '默认启用 IPv4 Unicast')] },
  { id: 'bgp-set', title: '修改 BGP 实例', section: 'bgp', code: 'BGP_INSTANCE', action: 'SET', data: 'bgp', fields: [...bgp, str('routerId', 'Router ID', false), bool('defaultIpv4Unicast', '默认启用 IPv4 Unicast')] },
  { id: 'bgp-delete', title: '删除 BGP 实例', section: 'bgp', code: 'BGP_INSTANCE', action: 'DELETE', data: 'bgp', fields: bgp },
  { id: 'bgp-neighbor-create', title: '添加 BGP 邻居', section: 'bgp', code: 'BGP_NEIGHBOR', action: 'CREATE', data: 'peer', fields: [...peer, num('remoteAs', '远端 ASN', 1, 4294967295, false), str('peerGroup', '邻居组', false), str('updateSource', '更新源接口 / 地址', false)] },
  { id: 'bgp-neighbor-set', title: '修改 BGP 邻居', section: 'bgp', code: 'BGP_NEIGHBOR', action: 'SET', data: 'peer', fields: [...peer, num('remoteAs', '远端 ASN', 1, 4294967295, false), str('peerGroup', '邻居组', false), str('updateSource', '更新源接口 / 地址', false)] },
  { id: 'bgp-neighbor-delete', title: '删除 BGP 邻居', section: 'bgp', code: 'BGP_NEIGHBOR', action: 'DELETE', data: 'peer', fields: peer },
  { id: 'bgp-group-create', title: '创建 BGP 邻居组', section: 'bgp', code: 'BGP_PEER_GROUP', action: 'CREATE', data: 'peer', fields: [...peer, num('remoteAs', '远端 ASN', 1, 4294967295, false), str('updateSource', '更新源接口 / 地址', false)] },
  { id: 'bgp-group-set', title: '修改 BGP 邻居组', section: 'bgp', code: 'BGP_PEER_GROUP', action: 'SET', data: 'peer', fields: [...peer, num('remoteAs', '远端 ASN', 1, 4294967295, false), str('updateSource', '更新源接口 / 地址', false)] },
  { id: 'bgp-group-delete', title: '删除 BGP 邻居组', section: 'bgp', code: 'BGP_PEER_GROUP', action: 'DELETE', data: 'peer', fields: peer },
  { id: 'evpn-peer-set', title: '配置 EVPN 邻居', section: 'bgp', code: 'BGP_EVPN_PEER', action: 'SET', data: 'peer', fields: [...peer, bool('active', '激活 EVPN'), bool('rrClient', '路由反射客户端')] },
  { id: 'evpn-peer-delete', title: '移除 EVPN 邻居配置', section: 'bgp', code: 'BGP_EVPN_PEER', action: 'DELETE', data: 'peer', fields: peer },
  { id: 'evpn-global-set', title: '配置 EVPN 全局发布', section: 'bgp', code: 'BGP_EVPN_GLOBAL', action: 'SET', data: 'evpnGlobal', fields: [num('asn', '本地 ASN'), bool('advertiseAllVni', '发布所有 VNI'), bool('advertiseSviIp', '发布 SVI 地址')] },
  { id: 'evpn-l2-set', title: '配置 L2VNI RD / RT', section: 'bgp', code: 'EVPN_L2VNI', action: 'SET', data: 'evpn', fields: [num('asn', '本地 ASN'), num('vni', 'L2VNI', 1, 16777215), str('rd', 'RD', false), ...rts] },
  { id: 'evpn-l2-delete', title: '删除 L2VNI BGP 配置', section: 'bgp', code: 'EVPN_L2VNI', action: 'DELETE', data: 'evpn', fields: [num('asn', '本地 ASN'), num('vni', 'L2VNI', 1, 16777215)] },
  { id: 'evpn-tenant-set', title: '配置租户 EVPN RD / RT', section: 'bgp', code: 'EVPN_TENANT', action: 'SET', data: 'evpn', fields: [...bgp, str('rd', 'RD', false), ...rts] },
  { id: 'evpn-tenant-delete', title: '删除租户 EVPN 配置', section: 'bgp', code: 'EVPN_TENANT', action: 'DELETE', data: 'evpn', fields: bgp },
  { id: 'ospf-create', title: '创建 OSPFv2 实例', section: 'ospf', code: 'OSPF_INSTANCE', action: 'CREATE', data: 'ospf', fields: [str('routerId', 'Router ID')] },
  { id: 'ospf-set', title: '修改 OSPFv2 实例', section: 'ospf', code: 'OSPF_INSTANCE', action: 'SET', data: 'ospf', fields: [str('routerId', 'Router ID')] },
  { id: 'ospf-delete', title: '删除 OSPFv2 实例', section: 'ospf', code: 'OSPF_INSTANCE', action: 'DELETE', data: 'ospf', fields: [] },
  { id: 'ospf-network-create', title: '添加 OSPFv2 网段', section: 'ospf', code: 'OSPF_NETWORK', action: 'CREATE', data: 'ospfNetwork', fields: [str('prefix', 'IPv4 网段'), { ...str('area', '区域'), default: '0.0.0.0' }] },
  { id: 'ospf-network-delete', title: '删除 OSPFv2 网段', section: 'ospf', code: 'OSPF_NETWORK', action: 'DELETE', data: 'ospfNetwork', fields: [str('prefix', 'IPv4 网段'), { ...str('area', '区域'), default: '0.0.0.0' }] },
  { id: 'ospf-interface-set', title: '配置 OSPFv2 接口', section: 'ospf', code: 'OSPF_INTERFACE', action: 'SET', data: 'ospfInterface', fields: [name('接口', 'interface'), bool('passive', 'Passive'), { key: 'networkType', label: '网络类型', type: 'select', options: ['broadcast','point-to-point','non-broadcast','point-to-multipoint'].map(value => ({ label: value, value })) }] },
  { id: 'ospf-interface-delete', title: '删除 OSPFv2 接口配置', section: 'ospf', code: 'OSPF_INTERFACE', action: 'DELETE', data: 'ospfInterface', fields: [name('接口', 'interface')] },
];
for (const action of ['CREATE','SET','DELETE']) {
 actions.push({
  id:'ips-rule-'+action.toLowerCase(),title:({CREATE:'创建规则',SET:'修改规则',DELETE:'删除规则'} as Record<string,string>)[action]!,
  section:'ips',code:'IPS_RULE',action,data:'ipsRule',feature:'snort-ips/v1',identity:['sid'],
  fields:[num('sid','规则 SID'),...(action==='DELETE'?[]:[{key:'rule',label:'Snort3 规则',type:'rule' as const,required:true,hint:'一条完整规则，sid 必须匹配。示例：drop icmp any any -> any any (msg:"Block ping"; itype:8; sid:1000001; rev:1;)'}])],
  description:'规则写入当前候选。提交时通过 Snort 校验和重载确认后才记为成功；规则作用于本节点所有 IPS 绑定接口。',
 });
 actions.push({
  id:'ips-interface-'+action.toLowerCase(),title:({CREATE:'绑定检查接口',SET:'修改检查方向',DELETE:'解除接口绑定'} as Record<string,string>)[action]!,
  section:'ips',code:'IPS_INTERFACE',action,data:'ipsInterface',feature:'snort-ips/v1',identity:['name'],
  fields:[{...name('VPP 原生接口名'),hint:'如 tap0、GigabitEthernet3b/0/0。请使用运行查询中的 VPP 接口名。'},...(action==='DELETE'?[]:[{key:'direction',label:'检查方向',type:'select' as const,required:true,default:'input',options:[{label:'入方向',value:'input'},{label:'出方向',value:'output'},{label:'双向',value:'inout'}]}])],
 });
}
export const resourceActions = actions;
actions.push({id:'neighbor-keepalive-set',title:'邻居保活（节点开关）',section:'bridge',feature:'neighbor-keepalive/v1',code:'NEIGHBOR_KEEPALIVE',action:'SET',data:'neighborKeepalive',fields:[{...bool('enabled','邻居保活'),required:true,default:false}],description:'仅 VPP 数据面支持。对本节点接入 BD 的动态 IPv4 / IPv6 邻居发送单播探测；收到有效应答才续期，连续三次无应答撤销对应 MAC/IP 通告。默认关闭；加入候选并提交后生效。'});
// These protocol operations use the same candidate and dependency planner as
// Linux resources. The UI never generates CLI commands.
for (const action of ['SET','DELETE']) {
  actions.push({id:'bgp-af-'+action.toLowerCase(),title:(action==='SET'?'配置':'删除')+' BGP 地址族邻居',section:'bgp',code:'BGP_AF_PEER',action,data:'peer',fields:[...peer,family,...(action==='SET'?[bool('active','激活地址族'),bool('rrClient','路由反射客户端')]:[])]});
  actions.push({id:'bgp-type5-'+action.toLowerCase(),title:(action==='SET'?'配置':'删除')+' EVPN Type-5 发布',section:'bgp',code:'EVPN_TYPE5',action,data:'bgpType5',fields:[...bgp,family,...(action==='SET'?[bool('enabled','发布此地址族前缀')]:[])]});
}
for (const action of ['CREATE','DELETE']) {
  actions.push({id:'bgp-network-'+action.toLowerCase(),title:(action==='CREATE'?'添加':'删除')+' BGP Network',section:'bgp',code:'BGP_NETWORK',action,data:'bgpNetwork',fields:[...bgp,family,str('prefix','网络前缀')]});
  actions.push({id:'bgp-redistribute-'+action.toLowerCase(),title:(action==='CREATE'?'添加':'删除')+' BGP 重分发',section:'bgp',code:'BGP_REDISTRIBUTE',action,data:'bgpRedistribute',fields:[...bgp,family,{key:'protocol',label:'来源协议',type:'select',required:true,options:['connected','static','ospf','ospf6'].map(value=>({label:value,value}))}]});
}
for (const action of actions.filter(a=>a.section==='ospf')) {
  action.fields.push(vrf);
  if(action.id==='ospf-interface-set') action.fields.push(str('area','区域',false),num('cost','Cost',1,65535,false),num('helloInterval','Hello 秒',1,65535,false),num('deadInterval','Dead 秒',1,65535,false));
}
for (const action of ['CREATE','SET','DELETE']) actions.push({id:'ospf6-'+action.toLowerCase(),title:({CREATE:'创建',SET:'修改',DELETE:'删除'} as Record<string,string>)[action]+' OSPFv3 实例',section:'ospf',code:'OSPF6_INSTANCE',action,data:'ospf',fields:[vrf,...(action==='DELETE'?[]:[str('routerId','Router ID（IPv4 格式）')])]});
actions.push({id:'ospf6-interface-set',title:'配置 OSPFv3 接口',section:'ospf',code:'OSPF6_INTERFACE',action:'SET',data:'ospf6Interface',fields:[name('接口','interface'),vrf,str('area','区域'),bool('passive','Passive'),{key:'networkType',label:'网络类型',type:'select',options:['broadcast','point-to-point'].map(value=>({label:value,value}))},num('cost','Cost',1,65535,false),num('helloInterval','Hello 秒',1,65535,false),num('deadInterval','Dead 秒',1,65535,false)]});
actions.push({id:'ospf6-interface-delete',title:'删除 OSPFv3 接口配置',section:'ospf',code:'OSPF6_INTERFACE',action:'DELETE',data:'ospf6Interface',fields:[name('接口','interface'),vrf]});
actions.push({id:'bridge-policy',title:'BD 的 ARP / ND 抑制策略',section:'bridge',code:'BD_PORT',action:'SET',data:'bridgePolicy',fields:[ref('bridge','BD','bridge'),{...bool('neighSuppress','ARP / ND 抑制'),required:true}],description:'作用于此 BD 当前及后续的 VXLAN 成员，保留主机端口行为。这是邻居抑制，不是主动探测保活。'});
export function initialFields(action: ResourceAction): Record<string, FieldValue> {
  return Object.fromEntries(action.fields.map(field => [field.key, field.default ?? (field.type==='number'?undefined:'')]));
}
export function buildOperation(action: ResourceAction, values: Record<string, FieldValue>): Operation {
  const data: Record<string, unknown> = {};
  for (const field of action.fields) {
    const value = values[field.key];
    if (value === '' || value === undefined) {
      if (field.required) throw new Error('请填写' + field.label);
      continue;
    }
    if (field.type === 'number') {
      const number = typeof value === 'number' ? value : Number(value);
      if (!Number.isSafeInteger(number) || number < (field.min ?? 0) || number > (field.max ?? 4294967295)) throw new Error(field.label + '超出有效整数范围');
      data[field.key] = number;
    } else if (field.type === 'boolean') {
      if (typeof value !== 'boolean') throw new Error(field.label + '必须选择启用或关闭');
      data[field.key] = value;
    } else if (field.type === 'list') {
      data[field.key] = String(value).split(/[,\s]+/).map(x => x.trim()).filter(Boolean);
    } else {
      const text = String(value).trim();
      if (field.required && !text) throw new Error('请填写' + field.label);
      if (/[\r\n\0]/.test(text)) throw new Error(field.label + '不能包含换行或控制字符');
      data[field.key] = text;
    }
  }
  return { code: action.code, action: action.action, [action.data]: data };
}
export function operationData(operation: Operation): Record<string, unknown> {
  const key = Object.keys(operation).find(key => !['id','code','action','dependsOn','depends_on'].includes(key));
  const data = key ? operation[key] : undefined;
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
}
export function supports(node: Node | undefined, code: string): boolean {
  return !!node?.capabilities?.operations.some(cap => cap.code === code && cap.rollback);
}
export function objectName(operation: Operation): string {
  if (operation.code === 'IPS_RULE') return 'SID ' + String(operationData(operation).sid);
  if (operation.code === 'NEIGHBOR_KEEPALIVE') return '节点邻居保活';
  const data = operationData(operation);
  return String(data.name ?? data.bridge ?? data.tenant ?? data.interface ?? data.vrf ?? data.prefix ?? data.vni ?? data.asn ?? operation.id ?? operation.code);
}
export function resourceSection(operation: Operation): ResourceSection | undefined {
  if (operation.code.startsWith('IPS_')) return 'ips';
  if (['TENANT','TENANT_L3VNI','BD_TENANT'].includes(operation.code)) return 'tenant';
  if (['BD','BD_PORT','BD_SUPPRESSION','NEIGHBOR_KEEPALIVE'].includes(operation.code)) return 'bridge';
  if (operation.code === 'VXLAN') return 'vxlan';
  if (operation.code.startsWith('BGP') || operation.code.startsWith('EVPN')) return 'bgp';
  if (operation.code.startsWith('OSPF')) return 'ospf';
  if (['INTERFACE','ADDRESS'].includes(operation.code)) return 'interface';
  return undefined;
}
export interface ResourceTree { id: string; label: string; kind: string; children?: ResourceTree[] }
export function resourceTree(objects: Operation[]): ResourceTree[] {
  const byCode = (code: string) => objects.filter(o => o.code === code);
  const tenants = byCode('TENANT');
  const bindings = byCode('BD_TENANT').map(operationData);
  const ports = byCode('BD_PORT').map(operationData);
  const addresses = byCode('ADDRESS').map(operationData);
  const vxlans = byCode('VXLAN').map(operationData);
  const makeBridge = (o: Operation): ResourceTree => {
    const name = String(operationData(o).name);
    const members = ports.filter(p => p.bridge === name);
    return { id: 'bd/'+name, label: name, kind: 'BD', children: [
      ...members.map(p => ({ id: 'port/'+String(p.port), label: String(p.port), kind: vxlans.some(v => v.name === p.port) ? 'VXLAN' : '端口' })),
      { id: 'l3/'+name, label: '三层接口 / 地址', kind: 'L3', children: addresses.filter(a => a.interface === name).map(a => ({ id: 'addr/'+name+'/'+String(a.prefix), label: String(a.prefix), kind: '地址' })) },
    ] };
  };
  const bridges = byCode('BD');
  const tree: ResourceTree[] = tenants.map(o => {
    const name = String(operationData(o).name);
    const l3 = byCode('TENANT_L3VNI').map(operationData).find(v => v.tenant === name);
    return { id: 'vrf/'+name, label: name + ' · table ' + String(operationData(o).tableId) + (l3 ? ' · L3VNI ' + String(l3.vni) : ' · 未绑定 L3VNI'), kind: 'VRF', children: bridges.filter(b => bindings.some(v => v.tenant === name && v.bridge === operationData(b).name)).map(makeBridge) };
  });
  const unbound = bridges.filter(b => !bindings.some(v => v.bridge === operationData(b).name)).map(makeBridge);
  const standaloneVxlan = vxlans.filter(v => !ports.some(p => p.port === v.name)).map(v => ({ id: 'vx/'+String(v.name), label: String(v.name)+' · VNI '+String(v.vni), kind: 'VXLAN' }));
  if (unbound.length || standaloneVxlan.length) tree.push({ id: 'unbound', label: '未绑定租户 / BD', kind: '未绑定', children: [...unbound, ...standaloneVxlan] });
  return tree;
}

export const queryKinds: {kind:string;label:string;section:ResourceSection}[] = [
 {kind:'IPS_STATUS',label:'IPS 服务与重载状态',section:'ips'}, {kind:'IPS_RULES',label:'实际生效规则',section:'ips'},
  {kind:'NEIGHBOR_KEEPALIVE_STATUS',label:'邻居保活状态（VPP）',section:'bridge'},
  {kind:'TENANTS',label:'VRF / 路由表',section:'tenant'}, {kind:'BRIDGES',label:'BD',section:'bridge'},
  {kind:'PORTS',label:'BD 成员端口',section:'bridge'}, {kind:'FDB',label:'MAC / FDB',section:'bridge'}, {kind:'NEIGHBORS',label:'ARP / ND 邻居',section:'bridge'},
  {kind:'INTERFACES',label:'接口属性与状态',section:'interface'}, {kind:'ADDRESSES',label:'IPv4 / IPv6 地址',section:'interface'},
  {kind:'VXLAN_TUNNELS',label:'VXLAN 详情',section:'vxlan'},
  {kind:'BGP_SUMMARY',label:'BGP 概要',section:'bgp'}, {kind:'BGP_NEIGHBORS',label:'BGP 邻居',section:'bgp'}, {kind:'BGP_ROUTES',label:'BGP 路由',section:'bgp'},
  {kind:'EVPN_ROUTES',label:'EVPN 路由',section:'bgp'}, {kind:'EVPN_VNI',label:'EVPN VNI',section:'bgp'},
  {kind:'OSPF_SUMMARY',label:'OSPF 概要',section:'ospf'}, {kind:'OSPF_INTERFACES',label:'OSPF 接口',section:'ospf'}, {kind:'OSPF_NEIGHBORS',label:'OSPF 邻居',section:'ospf'}, {kind:'OSPF_DATABASE',label:'OSPF LSDB',section:'ospf'}, {kind:'OSPF_ROUTES',label:'OSPF 路由',section:'ospf'},
];

export function resourceActionsForNode(node: Node | undefined, section: ResourceSection): ResourceAction[] {
  const has = (feature?: string) => !feature || !!node?.capabilities?.features?.includes(feature);
  return resourceActions.filter(a => a.section === section && has(a.feature))
    .map(a => ({ ...a, fields: a.fields.filter(f => has(f.feature)) }));
}
