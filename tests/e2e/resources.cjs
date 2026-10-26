/* Resource forms acceptance. Run ONLY against a disposable isolated lab.
 * Requires SDN_WEB_URL and SDN_TEST_TOKENS; does not guess a live deployment.
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const base=process.env.SDN_WEB_URL;
assert.ok(base&&process.env.SDN_TEST_TOKENS,'Explicit isolated SDN_WEB_URL and SDN_TEST_TOKENS required');
const tokens=JSON.parse(fs.readFileSync(process.env.SDN_TEST_TOKENS,'utf8'));
const artifacts=process.env.SDN_TEST_ARTIFACTS||path.resolve(__dirname,'../../artifacts/resources');fs.mkdirSync(artifacts,{recursive:true});
const previousReport=path.join(artifacts,'resource-browser-results.json');if(fs.existsSync(previousReport))fs.copyFileSync(previousReport,path.join(artifacts,'resource-browser-results-'+Date.now()+'.json'));
const results=[],errors=[];let browser,page;
function save(){fs.writeFileSync(path.join(artifacts,'resource-browser-results.json'),JSON.stringify({results,errors},null,2));}
function pass(name){results.push({name,status:'PASS'});save();console.log('PASS',name);}
async function api(p,method='GET',body,key){const r=await fetch(base+'/api/v1'+p,{method,headers:{Authorization:'Bearer '+tokens.admin,...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined});const v=await r.json();assert.ok(r.ok,`${method} ${p}: ${r.status} ${v.message||''}`);return v;}
async function poll(fn){let last;for(let n=0;n<150;n++){try{const v=await fn();if(v)return v;}catch(e){last=e;}await new Promise(r=>setTimeout(r,200));}throw last||new Error('poll timed out');}
async function login(p,token){await p.goto(base+'/#/login');await p.getByLabel('访问令牌',{exact:true}).fill(token);await p.getByRole('button',{name:'连接控制台',exact:true}).click();await p.getByRole('heading',{name:'节点管理',exact:true}).waitFor();}
async function route(p,name){await p.evaluate(v=>{location.hash='/'+v},name);}
async function choose(p,label,text){const combo=p.getByRole('combobox',{name:label,exact:true});await poll(()=>combo.isEnabled());await combo.focus();await combo.press('ArrowDown');await p.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({hasText:text}).first().click();}
async function field(label,value){const element=page.getByLabel(label,{exact:true}).first();if(typeof value==='boolean'){await choose(page,label,value?'启用 / 是':'关闭 / 否');}else if(await element.getAttribute('role')==='combobox'){await element.fill(String(value));await page.keyboard.press('Enter');}else await element.fill(String(value));}
async function operation(tab,title,fields){await page.getByRole('tab',{name:tab,exact:true}).click();await choose(page,'资源操作',title);for(const [key,value] of Object.entries(fields))await field(key,value);await page.getByRole('button',{name:'加入候选',exact:true}).click();await page.getByText('操作已加入候选，尚未下发。可继续添加其他操作，然后统一预览和提交。',{exact:true}).waitFor();}
async function start(){await page.getByRole('button',{name:'新建资源候选',exact:true}).click();await poll(async()=>await page.getByRole('button',{name:'预览全部变更',exact:true}).isEnabled());}
async function commit(){await page.getByRole('button',{name:'预览全部变更',exact:true}).click();await page.getByRole('heading',{name:'下发计划',exact:true}).waitFor();await page.getByRole('button',{name:'提交配置',exact:true}).click();const pop=page.locator('.el-popconfirm').filter({hasText:'确认提交整个候选'});await pop.getByRole('button',{name:/^(确定|确认|Yes|Confirm)$/}).click();await page.getByRole('heading',{name:'任务中心',exact:true}).waitFor();const id=await poll(()=>new URLSearchParams(page.url().split('?')[1]).get('id'));const job=await poll(async()=>{const j=await api('/jobs/'+id);if(['FAILED','PARTIAL','ROLLED_BACK','COMPENSATION_FAILED'].includes(j.state))throw new Error('Job '+j.state+': '+JSON.stringify(j));return j.state==='SUCCEEDED'?j:null;});await route(page,'desired');await page.getByRole('heading',{name:'Agent 资源工作台',exact:true}).waitFor();return job;}
async function selectNode(id){const nodes=(await api('/nodes?pageSize=200')).items;const n=nodes.find(v=>v.nodeId===id);await choose(page,'资源 Agent',n.name||id);await poll(async()=>await page.getByText('节点 '+id,{exact:false}).count());}
async function main(){
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const ctx=await browser.newContext({viewport:{width:1560,height:1100}});page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await login(page,tokens.admin);const nodes=(await api('/nodes?pageSize=200')).items;const leaf=nodes.find(n=>n.adopted&&(process.env.SDN_TEST_NODE_ID?n.nodeId===process.env.SDN_TEST_NODE_ID:n.role==='leaf'||/^leaf1(?=:|$)/.test(n.endpoint)));assert.ok(leaf,'isolated lab needs adopted leaf');
 await route(page,'desired');await selectNode(leaf.nodeId);
 let state=await api('/nodes/'+leaf.nodeId+'/resources');
 if(state.mode!=='resources'){
  const abort=page.getByRole('button',{name:'丢弃候选',exact:true});assert.ok(!(await abort.count())||!(await abort.isEnabled()),'start resource tests without an open candidate');
  await page.getByRole('button',{name:'验证并导入资源',exact:true}).click();await page.locator('.el-popconfirm').filter({hasText:'按当前 Agent 版本读回验证'}).getByRole('button',{name:/^(确定|确认|Yes|Confirm)$/}).click();
  await page.getByText('已验证并导入资源基线。请新建候选开始独立资源配置。',{exact:true}).waitFor();
  state=await api('/nodes/'+leaf.nodeId+'/resources');assert.equal(state.mode,'resources');pass('legacy or unmanaged baseline explicitly verified and imported');
 }
 const local=state.resources.objects.find(o=>o.code==='VXLAN')?.vxlan.local||'10.255.0.11';
 await start();await operation('租户与网络','创建租户 VRF',{'租户 VRF 名称':'WEB-TEST','路由表编号':62001});await commit();await selectNode(leaf.nodeId);
 state=await api('/nodes/'+leaf.nodeId+'/resources');assert.equal(state.resources.objects.filter(o=>o.code==='TENANT'&&o.tenant.name==='WEB-TEST').length,1);assert.ok(!state.resources.objects.some(o=>o.code==='BD_TENANT'&&o.binding.tenant==='WEB-TEST'));pass('form creates an empty VRF in its own committed transaction');
 await start();await operation('二层网络 BD','创建 BD',{'BD 名称':'webbd','STP':false,'MTU':1500});await operation('租户与网络','BD 加入租户',{'BD':'webbd','租户 VRF':'WEB-TEST'});await operation('三层接口与路由','接口 / BD 添加地址',{'接口 / BD':'webbd','IPv4 / IPv6 地址及前缀':'198.18.62.1/24'});await commit();await selectNode(leaf.nodeId);
 state=await api('/nodes/'+leaf.nodeId+'/resources');assert.equal(state.resources.objects.filter(o=>o.code==='TENANT'&&o.tenant.name==='WEB-TEST').length,1);assert.ok(state.resources.objects.some(o=>o.code==='BD_TENANT'&&o.binding.bridge==='webbd'));pass('later transaction adds BD and address to the existing VRF without recreating it');
 await start();await operation('二层网络 BD','创建 BD',{'BD 名称':'webl3','STP':false,'MAC 地址':'02:00:00:be:00:03','MTU':1500});await operation('租户与网络','BD 加入租户',{'BD':'webl3','租户 VRF':'WEB-TEST'});await operation('VXLAN 隧道','创建 VXLAN',{'VXLAN 接口名':'webvx3','VNI':62001,'本地 VTEP 地址':local,'隧道动态 MAC 学习':false});await operation('VXLAN 隧道','VXLAN 加入 BD',{'BD':'webl3','VXLAN 接口':'webvx3','MAC 学习':false});await operation('租户与网络','绑定 L3VNI',{'租户 VRF':'WEB-TEST','L3VNI':62001});await commit();await selectNode(leaf.nodeId);
 state=await api('/nodes/'+leaf.nodeId+'/resources');assert.ok(state.resources.objects.some(o=>o.code==='TENANT_L3VNI'&&o.l3vni.tenant==='WEB-TEST'&&o.l3vni.vni===62001));await page.getByText('WEB-TEST · table 62001 · L3VNI 62001',{exact:false}).waitFor();await page.screenshot({path:path.join(artifacts,'resources-tenant-tree.png')});pass('third transaction attaches L3VNI and relationship tree reflects tenant/BD/L3');
 await page.getByRole('button',{name:'查询运行状态',exact:true}).click();await page.getByText('linux+frr',{exact:false}).waitFor();pass('real VRF query displays provenance, timestamp and running records');
 await page.getByRole('tab',{name:'三层接口与路由',exact:true}).click();await page.getByLabel('查询接口',{exact:true}).fill('no-such-if');await page.getByRole('button',{name:'查询运行状态',exact:true}).click();await poll(async()=>await page.locator('.el-alert--error').count());assert.equal(await page.getByText('查询成功，没有匹配的运行状态记录',{exact:true}).count(),0);pass('query error remains an explicit error instead of empty success');
 const viewerCtx=await browser.newContext();const vp=await viewerCtx.newPage();await login(vp,tokens.viewer);await route(vp,'desired');await vp.getByRole('heading',{name:'Agent 资源工作台',exact:true}).waitFor();assert.equal(await vp.getByRole('button',{name:'新建资源候选',exact:true}).count(),0);assert.equal(await vp.getByRole('button',{name:'加入候选',exact:true}).count(),0);await viewerCtx.close();pass('viewer has query access and no resource mutation controls');
 assert.deepEqual(errors,[]);pass('no browser page errors');await browser.close();
}
main().catch(async e=>{results.push({name:'resource-browser',status:'FAIL',error:e.message});save();if(page)await page.screenshot({path:path.join(artifacts,'resources-failure.png')}).catch(()=>{});console.error(e);await browser?.close();process.exitCode=1;});
