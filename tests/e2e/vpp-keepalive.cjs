/* Real isolated lab: inspect the VPP-only switch, stage explicit false, query
 * native IPv4/IPv6 states, then abort the candidate without changing forwarding.
 * SDN_TEST_ACCESS points to sdn-agent's disposable stack-access.json.
 * SDN_BROWSER_URL optionally points to a local SSH port forward.
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
  await page.getByRole('tab',{name:'二层网络 BD',exact:true}).click();
  await choose('资源操作','邻居保活（节点开关）');
  const toggle=page.getByRole('switch',{name:'邻居保活',exact:true});
  await toggle.waitFor({state:'attached'});
  const create=page.waitForResponse(r=>r.url().endsWith('/changes')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'新建资源候选',exact:true}).click();
  candidate=(await (await create).json()).id;
  await page.waitForFunction(()=>document.querySelector('input[role="switch"][aria-label="邻居保活"]')?.getAttribute('aria-disabled')==='false');
  const toggleBox=page.locator('.el-switch').filter({has:toggle}).locator('.el-switch__core');
  await toggleBox.click(); assert.equal(await toggle.getAttribute('aria-checked'),'true');
  await toggleBox.click(); assert.equal(await toggle.getAttribute('aria-checked'),'false');
  const staging=page.waitForResponse(r=>r.url().includes('/resources')&&r.request().method()==='PUT');
  await page.getByRole('button',{name:'加入候选',exact:true}).click();
  const response=await staging; assert.ok(response.ok());
  assert.deepEqual(response.request().postDataJSON().operations,[{code:'NEIGHBOR_KEEPALIVE',action:'SET',neighborKeepalive:{enabled:false}}]);
  report.checks.push('real VPP switch stages explicit false through Gateway and Controller');
  await choose('查询类型','邻居保活状态');
  for (const family of ['IPV4','IPV6']) {
    await choose('查询地址族',family);
    const pending=page.waitForResponse(r=>r.url().includes('/query?')&&r.request().method()==='GET');
    await page.getByRole('button',{name:'查询运行状态',exact:true}).click();
    const q=await pending, result=await q.json(); assert.ok(q.ok(),JSON.stringify(result));
    assert.equal(result.source,'vpp'); assert.ok(result.records.length>0);
    assert.ok(result.records.every(r=>r.family===family&&r.enabled===true));
  }
  report.checks.push('candidate disable does not alter live dual-stack keepalive');
  await page.screenshot({path:path.join(out,'web-keepalive.png'),fullPage:true});
  assert.deepEqual(report.errors,[]); report.status='passed';
}
main().catch(e=>{report.status='failed';report.errors.push(String(e.stack||e));process.exitCode=1;}).finally(async()=>{
  if(candidate)try{await api('/changes/'+encodeURIComponent(candidate),'DELETE');}catch(e){report.errors.push('candidate cleanup: '+e.message);report.status='failed';process.exitCode=1;}
  if(browser)await browser.close();
  fs.writeFileSync(path.join(out,'web-keepalive.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
});
