<script setup lang="ts">
import { computed,onBeforeUnmount,ref,watch } from 'vue';
import { request,date,errorText } from '../api';
import { queryKinds,type ResourceSection } from '../resources';
import { queryColumns, queryCell } from '../query-presentation';
import type { Node,QueryResponse } from '../types';
const props=defineProps<{node:Node;section:ResourceSection}>();
const kind=ref('TENANTS');const family=ref('AF_UNSPECIFIED');const ospfVersion=ref(2);
const vrf=ref('');const bridge=ref('');const iface=ref('');const prefix=ref('');const neighbor=ref('');const routeType=ref('');
const result=ref<QueryResponse>();const error=ref('');const busy=ref(false);let active=new AbortController();let generation=0;
const available=computed(()=>queryKinds.filter(q=>q.section===props.section&&(q.kind!=='NEIGHBOR_KEEPALIVE_STATUS'||props.node.capabilities?.features?.includes('neighbor-keepalive/v1'))));
const capability=computed(()=>props.node.capabilities?.queries?.find(q=>q.kind===kind.value));
const supported=computed(()=>!!capability.value);
const isVpp=computed(()=>props.node.capabilities?.features?.includes('dataplane/vpp-26.06')||result.value?.source==='vpp');
const fields=computed(()=>queryColumns(kind.value,!!isVpp.value,result.value?.records||[]));
const neighborFilter=computed(()=>['BGP_NEIGHBORS','NEIGHBORS','NEIGHBOR_KEEPALIVE_STATUS'].includes(kind.value)||(isVpp.value&&kind.value==='VXLAN_TUNNELS'));
const families=computed(()=>capability.value?.families||[]);
const versions=computed(()=>capability.value?.ospfVersions||[]);
const ospf=computed(()=>kind.value.startsWith('OSPF'));
const vrfFilter=computed(()=>!['TENANTS','EVPN_ROUTES','EVPN_VNI','IPS_STATUS','IPS_RULES'].includes(kind.value));
const bridgeFilter=computed(()=>['BRIDGES','PORTS','FDB','NEIGHBORS','NEIGHBOR_KEEPALIVE_STATUS','VXLAN_TUNNELS'].includes(kind.value));
const interfaceFilter=computed(()=>['INTERFACES','ADDRESSES','ROUTES','PORTS','FDB','NEIGHBORS','NEIGHBOR_KEEPALIVE_STATUS','VXLAN_TUNNELS','OSPF_INTERFACES'].includes(kind.value));
function reset(){active.abort();generation++;busy.value=false;result.value=undefined;error.value='';}
watch(()=>[props.node.nodeId,props.section],()=>{reset();kind.value=available.value[0]?.kind||'TENANTS';vrf.value='';bridge.value='';iface.value='';prefix.value='';neighbor.value='';routeType.value='';},{immediate:true});
watch(kind,()=>{reset();family.value='AF_UNSPECIFIED';ospfVersion.value=versions.value[0]||2;});
watch([family,ospfVersion,vrf,bridge,iface,prefix,neighbor,routeType],reset);
const cell=queryCell;
async function run(next=false){
  resetForRequest();const signal=active.signal;const mine=generation;
  const params=new URLSearchParams({kind:kind.value,pageSize:'100'});
  if(family.value!=='AF_UNSPECIFIED')params.set('family',family.value);
  if(ospf.value)params.set('ospfVersion',String(ospfVersion.value));
  if(vrfFilter.value&&vrf.value)params.set('vrf',vrf.value);
  if(bridgeFilter.value&&bridge.value)params.set('bridge',bridge.value);
  if(interfaceFilter.value&&iface.value)params.set('interface',iface.value);
  if(['ROUTES','BGP_ROUTES','EVPN_ROUTES'].includes(kind.value)&&prefix.value)params.set('prefix',prefix.value);
  if(neighborFilter.value&&neighbor.value)params.set('neighbor',neighbor.value);
  if(kind.value==='EVPN_ROUTES'&&routeType.value)params.set('routeType',routeType.value);
  if(next&&result.value?.nextPageToken)params.set('pageToken',result.value.nextPageToken);
  try{const page=await request<QueryResponse>(`/nodes/${encodeURIComponent(props.node.nodeId)}/query?${params}`,{signal});if(mine===generation)result.value=page;}
  catch(e){if(!signal.aborted&&mine===generation){error.value=errorText(e);result.value=undefined;}}
  finally{if(mine===generation)busy.value=false;}
}
function resetForRequest(){active.abort();active=new AbortController();generation++;busy.value=true;error.value='';}
onBeforeUnmount(()=>active.abort());
</script>
<template><div class="panel"><h2>运行状态查询 <el-tag v-if="isVpp" type="primary">VPP 数据面</el-tag></h2><p class="subtitle">来自 Agent 的实时查询。配置目标和候选不代表设备已经生效；查询失败会单独报错。</p>
<div class="toolbar"><el-select v-model="kind" aria-label="查询类型" style="width:210px"><el-option v-for="q in available" :key="q.kind" :value="q.kind" :label="q.label+(node.capabilities?.queries?.some(c=>c.kind===q.kind)?'':'（能力未支持）')" :disabled="!node.capabilities?.queries?.some(c=>c.kind===q.kind)"/></el-select>
<el-select v-if="families.length" v-model="family" aria-label="查询地址族" style="width:150px"><el-option label="默认地址族" value="AF_UNSPECIFIED"/><el-option v-for="f in families" :key="f" :label="f" :value="f"/></el-select>
<el-select v-if="ospf" v-model="ospfVersion" aria-label="OSPF 版本" style="width:140px"><el-option v-for="v in versions" :key="v" :value="v" :label="'OSPFv'+v"/></el-select>
<el-button type="primary" :loading="busy" :disabled="!supported" @click="run(false)">查询运行状态</el-button></div>
<div class="resource-filters"><el-input v-if="vrfFilter" v-model="vrf" placeholder="VRF（空为默认 / 全部，依查询类型）" aria-label="查询 VRF" clearable/><el-input v-if="bridgeFilter" v-model="bridge" placeholder="BD 名称" aria-label="查询 BD" clearable/><el-input v-if="interfaceFilter" v-model="iface" placeholder="接口名称" aria-label="查询接口" clearable/><el-input v-if="['ROUTES','BGP_ROUTES','EVPN_ROUTES'].includes(kind)" v-model="prefix" placeholder="精确网络前缀" aria-label="查询前缀" clearable/><el-input v-if="neighborFilter" v-model="neighbor" placeholder="邻居 / 远端 VTEP 地址" aria-label="查询邻居" clearable/><el-select v-if="kind==='EVPN_ROUTES'" v-model="routeType" aria-label="EVPN 路由类型" clearable placeholder="全部 EVPN 类型"><el-option v-for="n in [1,2,3,4,5]" :key="n" :value="String(n)" :label="'Type-'+n"/></el-select></div>
<el-alert v-if="!supported" title="此 Agent 未声明支持该查询；请检查适配器和能力协商。" type="warning" :closable="false"/>
<el-alert v-if="error" :title="error" type="error" :closable="false"/>
<template v-if="result"><p class="subtitle mono">来源 {{result.source}} · 采集 {{date(result.collectedUnixMs)}} · Agent 版本 {{result.revision}} · 共 {{result.totalCount}} 条 · {{result.stale?'STALE（陈旧）':'本次查询'}}</p><el-alert v-if="result.stale||result.error" :title="result.error||'结果已陈旧，请重新查询。'" type="warning" :closable="false"/><el-table :data="result.records" empty-text="查询成功，没有匹配的运行状态记录" style="width:100%"><el-table-column type="expand"><template #default="{row}"><div v-if="isVpp&&kind==='VXLAN_TUNNELS'" class="query-remotes"><h3>远端封装映射</h3><el-table :data="row.remotes||[]" empty-text="尚无 EVPN 远端成员，接口仍保留"><el-table-column prop="remote" label="远端 VTEP" min-width="240"/><el-table-column prop="mac" label="目的 MAC" min-width="180"/><el-table-column label="用途"><template #default="{row:remote}">{{remote.bum?'BUM 复制':'单播封装'}}</template></el-table-column></el-table></div><details><summary>完整原生查询结果</summary><pre class="code">{{JSON.stringify(row,null,2)}}</pre></details></template></el-table-column><el-table-column v-for="f in fields" :key="f.key" :label="f.label" min-width="150" show-overflow-tooltip><template #default="{row}">{{cell(row[f.key],f.key)}}</template></el-table-column></el-table><div class="toolbar" style="margin-top:12px"><el-button :disabled="busy||!result.nextPageToken" @click="run(true)">下一页</el-button><span class="muted">筛选变化后需重新查询；运行表变化会使旧分页令牌失效。</span></div></template>
<el-empty v-else-if="!error" description="选择查询类型，读取设备当前状态"/>
</div></template>
