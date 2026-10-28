import { describe,it,expect } from 'vitest';
import { buildOperation,initialFields,resourceActions,resourceTree,resourceActionsForNode,supports } from './resources';
import type { Node,Operation } from './types';
const action=(id:string)=>resourceActions.find(a=>a.id===id)!;
describe('resource forms',()=>{
 it('gates outer VRF controls and preserves an explicit return to VRF zero',()=>{
  const node={capabilities:{operations:[{code:'VXLAN',rollback:true}],features:['vxlan-encap-vrf/v1']}} as unknown as Node;
  const available=resourceActionsForNode(node,'vxlan');
  const set=available.find(a=>a.id==='vxlan-encap-vrf-set')!;
  expect(buildOperation(set,{name:'vx50000',encapVrfId:0})).toEqual({code:'VXLAN',action:'SET',vxlan:{name:'vx50000',encapVrfId:0}});
  expect(()=>buildOperation(set,{name:'vx50000'})).toThrow();
  const old={capabilities:{operations:[{code:'VXLAN',rollback:true}],features:[]}} as unknown as Node;
  const hidden=resourceActionsForNode(old,'vxlan');
  expect(hidden.some(a=>a.id==='vxlan-encap-vrf-set')).toBe(false);
  expect(hidden.find(a=>a.id==='vxlan-create')!.fields.some(f=>f.key==='encapVrfId')).toBe(false);
 });

 it('keeps the VPP neighbor policy singleton and preserves explicit disable',()=>{
  const a=action('neighbor-keepalive-set');
  expect(buildOperation(a,initialFields(a))).toEqual({code:'NEIGHBOR_KEEPALIVE',action:'SET',neighborKeepalive:{enabled:false}});
  expect(buildOperation(a,{enabled:true}).neighborKeepalive).toEqual({enabled:true});
  expect(()=>buildOperation(a,{})).toThrow();
  expect(supports({capabilities:{operations:[]}} as unknown as Node,a.code)).toBe(false);
 });
 it('retains explicit false/zero while optional blank fields are untouched',()=>{
  const a=action('bridge-set');const op=buildOperation(a,{...initialFields(a),name:'br10',stp:false,ageingTime:0});
  expect(op).toEqual({code:'BD',action:'SET',bridge:{name:'br10',stp:false,ageingTime:0}});
 });
 it('deletes only identified resource and never recreates its tenant',()=>{
  expect(buildOperation(action('tenant-delete'),{name:'TENANT-A'})).toEqual({code:'TENANT',action:'DELETE',tenant:{name:'TENANT-A'}});
  expect(buildOperation(action('bridge-vrf-bind'),{bridge:'br10',tenant:'TENANT-A'})).toEqual({code:'BD_TENANT',action:'BIND',binding:{bridge:'br10',tenant:'TENANT-A'}});
  expect(buildOperation(action('tenant-l3-bind'),{tenant:'TENANT-A',vni:50000}).code).toBe('TENANT_L3VNI');
 });
 it('validates required identifiers, integer ranges and CLI control characters',()=>{
  expect(()=>buildOperation(action('tenant-create'),{name:'a',tableId:0})).toThrow();
  expect(()=>buildOperation(action('tenant-create'),{name:'a',tableId:1.5})).toThrow();
  expect(()=>buildOperation(action('tenant-create'),{name:'',tableId:1})).toThrow();
  expect(()=>buildOperation(action('tenant-create'),{name:'a\nend',tableId:1})).toThrow();
 });
 it('supports dual-stack protocols and BD policy without raw JSON',()=>{
  expect(buildOperation(action('bgp-type5-set'),{asn:65000,vrf:'A',family:'IPV6',enabled:false})).toEqual({code:'EVPN_TYPE5',action:'SET',bgpType5:{asn:65000,vrf:'A',family:'IPV6',enabled:false}});
  expect(buildOperation(action('ospf6-interface-set'),{name:'uplink',area:'0.0.0.0',passive:false}).code).toBe('OSPF6_INTERFACE');
  expect(buildOperation(action('bridge-policy'),{bridge:'br10',neighSuppress:false}).bridgePolicy).toEqual({bridge:'br10',neighSuppress:false});
 });
 it('requires an advertised operation with rollback support',()=>{
  const node={capabilities:{operations:[{code:'BD',rollback:true},{code:'VXLAN',rollback:false}]}} as Node;
  expect(supports(node,'BD')).toBe(true);expect(supports(node,'VXLAN')).toBe(false);expect(supports(node,'TENANT')).toBe(false);expect(supports(undefined,'BD')).toBe(false);
 });
});
describe('tenant relation tree',()=>{
 it('keeps empty tenants, orphan bridges and tunnels, and shares BD addresses',()=>{
  const ops:Operation[]=[{code:'TENANT',action:'CREATE',tenant:{name:'empty',tableId:1}},{code:'TENANT',action:'CREATE',tenant:{name:'A',tableId:1001}},{code:'BD',action:'CREATE',bridge:{name:'br10'}},{code:'BD',action:'CREATE',bridge:{name:'orphan'}},{code:'BD_TENANT',action:'BIND',binding:{bridge:'br10',tenant:'A'}},{code:'ADDRESS',action:'CREATE',address:{interface:'br10',prefix:'2001:db8::1/64'}},{code:'VXLAN',action:'CREATE',vxlan:{name:'vx100',vni:100}},{code:'TENANT_L3VNI',action:'BIND',l3vni:{tenant:'A',vni:50000}}];
  const tree=resourceTree(ops);expect(tree[0]?.children).toEqual([]);expect(tree[1]?.label).toContain('50000');expect(tree[1]?.children?.[0]?.children?.[0]?.children?.[0]?.label).toBe('2001:db8::1/64');expect(tree[2]?.children?.map(c=>c.id)).toEqual(['bd/orphan','vx/vx100']);
 });
});
