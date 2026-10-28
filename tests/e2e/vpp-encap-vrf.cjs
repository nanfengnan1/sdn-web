/* Isolated real Web: stage explicit outer VRF zero, inspect native query
 * columns, and abort the candidate without applying it.
 * SDN_TEST_ACCESS is the disposable stack access file; SDN_BROWSER_URL may
 * override its URL. Tokens are never included in the report.
 */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
assert.ok(process.env.SDN_TEST_ACCESS, 'Explicit disposable lab access file required');
const access = JSON.parse(fs.readFileSync(process.env.SDN_TEST_ACCESS, 'utf8'));
assert.match(access.stamp, /^sdn-vpp-irb-/);
const out = path.dirname(process.env.SDN_TEST_ACCESS);
const base = process.env.SDN_BROWSER_URL || access.url;
const report = { status: 'running', checks: [], errors: [] };
let browser, page, candidate;
async function api(endpoint, method = 'GET', body) {
  const r = await fetch(base + '/api/v1' + endpoint, {method, headers:{Authorization:'Bearer '+access.admin,'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()}, body:body===undefined?undefined:JSON.stringify(body)});
  const v = await r.json(); assert.ok(r.ok, JSON.stringify(v)); return v;
}
async function choose(label, text) {
  const combo = page.getByRole('combobox', { name: label, exact: true });
  await combo.focus(); await combo.press('ArrowDown');
  await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({hasText:text}).first().click();
}
async function main() {
  browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  page = await browser.newPage({viewport:{width:1700,height:1100}});
  page.on('pageerror', e=>report.errors.push(e.message));
  await page.goto(base+'/#/login');
  await page.getByLabel('访问令牌',{exact:true}).fill(access.admin);
  await page.getByRole('button',{name:'连接控制台',exact:true}).click();
  await page.getByRole('heading',{name:'节点管理',exact:true}).waitFor();
  await page.evaluate(()=>{location.hash='/desired';});
  await page.getByRole('heading',{name:'Agent 资源工作台',exact:true}).waitFor();
  await choose('资源 Agent',access.nodeId);

  await page.getByRole('tab',{name:'隧道',exact:true}).click();
  await choose('资源操作','修改 VXLAN 外层 VRF');
  const create=page.waitForResponse(r=>r.url().endsWith('/changes')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'新建资源候选',exact:true}).click();
  candidate=(await (await create).json()).id;
  await choose('VXLAN 接口名','vx50000');
  const field=page.getByRole('spinbutton',{name:'外层 VRF 表 ID',exact:true});
  await field.fill('0'); await field.blur();
  const staging=page.waitForResponse(r=>r.url().includes('/resources')&&r.request().method()==='PUT');
  await page.getByRole('button',{name:'加入候选',exact:true}).click();
  const response=await staging; assert.ok(response.ok(),await response.text());
  assert.deepEqual(response.request().postDataJSON().operations,[{code:'VXLAN',action:'SET',vxlan:{name:'vx50000',encapVrfId:0}}]);
  report.checks.push('outer VRF form stages explicit zero through Gateway and Controller');
  await choose('查询类型','VXLAN 详情');
  const pending=page.waitForResponse(r=>r.url().includes('/query?')&&r.request().method()==='GET');
  await page.getByRole('button',{name:'查询运行状态',exact:true}).click();
  const q=await pending,result=await q.json(); assert.ok(q.ok(),JSON.stringify(result));
  assert.equal(result.source,'vpp');
  assert.ok(result.records.length>0);
  assert.ok(result.records.every(r=>Number.isInteger(r.encapVrfId)));
  await page.getByRole('columnheader',{name:'外层 VRF 表 ID',exact:true}).waitFor();
  report.checks.push('query renders native outer VRF table IDs');
  await page.screenshot({path:path.join(out,'web-encap-vrf.png'),fullPage:true});
  assert.deepEqual(report.errors,[]); report.status='passed';
}
main().catch(e=>{report.status='failed';report.errors.push(String(e.stack||e));process.exitCode=1;}).finally(async()=>{
  if(candidate)try{await api('/changes/'+encodeURIComponent(candidate),'DELETE');}catch(e){report.errors.push('candidate cleanup: '+e.message);report.status='failed';process.exitCode=1;}
  if(browser)await browser.close();
  fs.writeFileSync(path.join(out,'web-encap-vrf.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
});
