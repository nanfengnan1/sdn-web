/* Read-only acceptance of the empty, ready-for-manual-testing Docker stack. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const base = process.env.SDN_WEB_URL || 'http://10.8.126.103:28080';
const artifacts = process.env.SDN_TEST_ARTIFACTS || path.resolve(__dirname, '../../../sdn-controller/artifacts/docker');
const tokensFile = process.env.SDN_TEST_TOKENS || path.resolve(__dirname, '../../../sdn-controller/docker/state/tokens.json');
const tokens = JSON.parse(fs.readFileSync(tokensFile, 'utf8'));
let browser;
async function main() {
  fs.mkdirSync(artifacts, {recursive:true});
  async function read(p) {
    const r = await fetch(base+'/api/v1'+p,{headers:{Authorization:`Bearer ${tokens.admin}`}});
    assert.equal(r.status,200); return r.json();
  }
  const nodes = await read('/nodes'), desired = await read('/desired'), jobs = await read('/jobs');
  assert.equal(nodes.items.length,3);
  assert.ok(nodes.items.every(n=>n.state==='RUNNING'&&!n.adopted&&n.agentRevision==='0'));
  assert.equal(desired.revision,'0');
  assert.deepEqual(desired.configuration,{nodes:[],tenants:[],networks:[]});
  assert.deepEqual(jobs.items,[]);
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/#/login');
  await page.getByLabel('访问令牌',{exact:true}).fill(tokens.admin);
  await page.getByRole('button',{name:'连接控制台',exact:true}).click();
  await page.getByText('leaf1:9090',{exact:true}).waitFor();
  assert.equal(await page.getByText('待确认',{exact:true}).count(),3);
  await page.getByText('RUNNING',{exact:true}).first().waitFor();
  await page.waitForTimeout(600); // Finish table/tag enter transitions before evidence capture.
  await page.screenshot({path:path.join(artifacts,'manual-ready-nodes.png')});
  await page.evaluate(()=>{location.hash='/desired';});
  await page.getByText('尚未配置租户',{exact:true}).waitFor();
  await page.getByText('尚未配置网络',{exact:true}).waitFor();
  await page.screenshot({path:path.join(artifacts,'manual-ready-desired.png')});
  await page.evaluate(()=>{location.hash='/jobs';});
  await page.getByText('尚无配置任务',{exact:true}).waitFor();
  await page.screenshot({path:path.join(artifacts,'manual-ready-jobs.png')});
  assert.deepEqual(errors,[]);
  const after=await read('/desired'); assert.deepEqual(after,desired);
  assert.deepEqual((await read('/jobs')).items,[]);
  const result={status:'PASS',base,browser:browser.version(),nodes:3,adopted:0,revision:'0',jobs:0,readOnly:true};
  fs.writeFileSync(path.join(artifacts,'manual-ready-browser.json'),JSON.stringify(result,null,2));
  console.log('PASS empty Docker environment: login, 3 unadopted nodes, no tenants/networks/jobs; no writes performed.');
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
