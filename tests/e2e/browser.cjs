/* Real browser acceptance against the isolated, already provisioned SDN lab. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const base = process.env.SDN_WEB_URL || 'http://10.8.126.103:18080';
const artifacts = process.env.SDN_TEST_ARTIFACTS || path.resolve(__dirname, '../../../sdn-controller/artifacts');
const tokensPath = process.env.SDN_TEST_TOKENS || path.resolve(__dirname, '../../../sdn-controller/lab/state/tokens.json');
const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
fs.mkdirSync(artifacts, {recursive:true});
const results = [], pageErrors = [], consoleErrors = [];
let browser, page;
function save(name, data) { fs.writeFileSync(path.join(artifacts, name), JSON.stringify(data,null,2)); }
function pass(name) { results.push({name,status:'PASS'}); save('browser-results.json',results); console.log('PASS',name); }
async function api(url, method='GET', body, key) {
  const headers = {Authorization:`Bearer ${tokens.admin}`};
  if (body !== undefined) headers['Content-Type']='application/json';
  if (key) headers['Idempotency-Key']=key;
  const r=await fetch(base+'/api/v1'+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const value=await r.json(); assert.ok(r.ok,`${method} ${url}: ${r.status} ${value.message||''}`); return value;
}
async function poll(fn, ms=30000) { const end=Date.now()+ms; let last; while(Date.now()<end){try{const r=await fn();if(r)return r;}catch(e){last=e;}await new Promise(r=>setTimeout(r,200));}throw last||new Error('poll timed out'); }
async function login(p, token) {
  await p.goto(base+'/#/login');
  await p.getByLabel('访问令牌',{exact:true}).fill(token);
  await p.getByRole('button',{name:'连接控制台',exact:true}).click();
  await p.getByRole('heading',{name:'节点管理',exact:true}).waitFor();
}
async function route(p, name) {
  // Change only the hash so the token remains in memory.
  await p.evaluate(value=>{location.hash=value;},'/'+name);
}
async function confirmCommit(p) {
  await p.getByRole('button',{name:'提交配置',exact:true}).click();
  const pop=p.locator('.el-popconfirm').filter({hasText:'确认提交此计划'});
  await pop.getByRole('button',{name:/^(确定|确认|Yes|Confirm)$/}).click();
}
async function apiNoop() {
  const desired=await api('/desired');
  const c=await api('/changes','POST',{baseRevision:desired.revision},crypto.randomUUID());
  const plan=await api(`/changes/${c.id}/plan`,'POST');
  const j=await api(`/changes/${c.id}/commit`,'POST',{planId:plan.id},crypto.randomUUID());
  return await poll(async()=>{const x=await api(`/jobs/${j.id}`);assert.notEqual(x.state,'FAILED');return x.state==='SUCCEEDED'?x:null;});
}
async function main() {
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  save('browser-environment.json',{browser:browser.version(),node:process.version,base});
  const context=await browser.newContext({viewport:{width:1500,height:1000}});page=await context.newPage();
  page.on('pageerror',e=>pageErrors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  await login(page,tokens.admin);
  await page.getByText('spine',{exact:true}).first().waitFor();
  assert.equal(await page.getByText('已纳管',{exact:true}).count(),3);
  await page.screenshot({path:path.join(artifacts,'ui-nodes.png')});
  await page.getByRole('button',{name:'详情',exact:true}).first().click();
  await page.getByRole('heading',{name:'操作能力',exact:true}).waitFor();
  await page.keyboard.press('Escape');
  pass('admin login, three real adopted nodes and capability detail');
  await route(page,'desired');
  await page.getByText('TENANT-A',{exact:true}).waitFor();
  await page.screenshot({path:path.join(artifacts,'ui-desired.png')});
  pass('desired view displays real TENANT-A and L2/L3 network configuration');
  await route(page,'changes');
  await page.getByRole('button',{name:'新建候选',exact:true}).click();
  await page.getByLabel('完整资源配置 JSON',{exact:true}).waitFor();
  const text=await page.getByLabel('完整资源配置 JSON',{exact:true}).inputValue();
  const draft=JSON.parse(text);assert.equal(draft.nodes.length,3);assert.equal(draft.tenants[0].name,'TENANT-A');
  // Exercise editing with a formatting-only change, then preview a no-op.
  await page.getByLabel('完整资源配置 JSON',{exact:true}).fill(JSON.stringify(draft,null,4));
  await page.getByRole('button',{name:'保存候选',exact:true}).click();
  await page.getByText('候选已保存；尚未下发。',{exact:true}).waitFor();
  await page.getByRole('button',{name:'预览计划',exact:true}).click();
  await page.getByRole('heading',{name:'下发计划',exact:true}).waitFor();
  await page.screenshot({path:path.join(artifacts,'ui-plan.png')});
  pass('HTTP-context UUID creation, candidate edit/save and real plan preview');
  // Commit another administrator's no-op after the UI preview to force a real conflict.
  await apiNoop();
  await confirmCommit(page);
  await page.getByText('desired revision conflict',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'新建候选',exact:true}).isEnabled(),true);
  assert.equal(await page.getByLabel('完整资源配置 JSON',{exact:true}).inputValue(),JSON.stringify(draft,null,2));
  pass('real 409 revision conflict preserves draft and unlocks new candidate');
  await page.getByRole('button',{name:'新建候选',exact:true}).click();
  await poll(async()=>await page.getByRole('button',{name:'预览计划',exact:true}).isEnabled());
  await page.getByRole('button',{name:'预览计划',exact:true}).click();
  await page.getByRole('heading',{name:'下发计划',exact:true}).waitFor();
  await confirmCommit(page);
  await page.getByRole('heading',{name:'任务中心',exact:true}).waitFor();
  await page.getByRole('heading',{name:'任务详情 · SUCCEEDED',exact:true}).waitFor();
  const jobId=new URLSearchParams(page.url().split('?')[1]).get('id');assert.ok(jobId);
  await page.screenshot({path:path.join(artifacts,'ui-job.png')});
  pass('browser Commit returns Job, event handling reaches real SUCCEEDED');
  await page.reload();
  await page.getByLabel('访问令牌',{exact:true}).waitFor();
  const stored=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));
  assert.ok(!stored.includes(tokens.admin)&&!stored.includes(tokens.viewer));
  await page.getByLabel('访问令牌',{exact:true}).fill(tokens.admin);
  await page.getByRole('button',{name:'连接控制台',exact:true}).click();
  await page.getByRole('heading',{name:'任务详情 · SUCCEEDED',exact:true}).waitFor();
  pass('refresh forgets token; reauthentication restores persisted Job');
  await route(page,'topology');
  await page.getByRole('heading',{name:'网络拓扑',exact:true}).waitFor();
  await page.getByRole('button',{name:'采集最新状态',exact:true}).click();
  await poll(async()=>await page.getByRole('button',{name:'采集最新状态',exact:true}).isEnabled());
  await page.locator('.graph canvas').first().waitFor();
  await page.getByText('192.168.10.11',{exact:true}).first().waitFor();
  await page.screenshot({path:path.join(artifacts,'ui-topology.png'),fullPage:true});
  pass('G6 renders observed topology and real host EVPN routes');
  const viewer=await browser.newContext({viewport:{width:1500,height:1000}});const vp=await viewer.newPage();
  vp.on('pageerror',e=>pageErrors.push(e.message));await login(vp,tokens.viewer);
  await route(vp,'changes');
  await vp.getByRole('heading',{name:'配置变更',exact:true}).waitFor();
  assert.equal(await vp.getByRole('button',{name:'新建候选',exact:true}).count(),0);
  const denied=await vp.evaluate(async({token})=>{const r=await fetch('/api/v1/changes',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Idempotency-Key':'browser-viewer-denied'},body:'{"baseRevision":"0"}'});return r.status;},{token:tokens.viewer});
  assert.equal(denied,403);await vp.screenshot({path:path.join(artifacts,'ui-viewer.png')});
  pass('viewer UI hides configuration writes and server rejects forged write with 403');
  await route(vp,'jobs?id=does-not-exist');
  await vp.getByText('job not found',{exact:true}).waitFor();
  pass('missing Job is shown as an error rather than fabricated success');
  assert.deepEqual(pageErrors,[]);
  pass('no uncaught browser page errors across real navigation and mutations');
  save('browser-console.json',{pageErrors,consoleErrors});
}
main().catch(async e=>{
  results.push({name:'browser execution',status:'FAIL',error:e.message});save('browser-results.json',results);save('browser-console.json',{pageErrors,consoleErrors});
  if(page)await page.screenshot({path:path.join(artifacts,'ui-failure.png')}).catch(()=>{});
  console.error(e.stack);process.exitCode=1;
}).finally(async()=>{if(browser)await browser.close();});
