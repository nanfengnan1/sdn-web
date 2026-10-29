/* Real disposable stack only: create/delete Snort rules from the IPS page. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
assert.ok(process.env.SDN_TEST_ACCESS,'disposable access file required');
const access=JSON.parse(fs.readFileSync(process.env.SDN_TEST_ACCESS,'utf8'));
assert.match(access.stamp,/^sdn-ips-/);
const out=path.dirname(process.env.SDN_TEST_ACCESS),base=process.env.SDN_BROWSER_URL||access.url;
const report={status:'running',checks:[],errors:[]};let browser,page;
async function api(endpoint){
 const r=await fetch(base+'/api/v1'+endpoint,{headers:{Authorization:'Bearer '+access.admin}});
 const v=await r.json();assert.ok(r.ok,JSON.stringify(v));return v;
}
async function choose(label,text){
 const combo=page.getByRole('combobox',{name:label,exact:true});
 for(let i=0;i<100&&!(await combo.isEnabled());i++)await new Promise(r=>setTimeout(r,100));
 assert.ok(await combo.isEnabled(),label+' must be ready');
 await combo.focus();
 if(await combo.getAttribute('aria-expanded')==='false')await combo.press('ArrowDown');
 await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({hasText:text}).first().click();
}
async function jobDone(id){
 for(let i=0;i<90;i++){
  const j=await api('/jobs/'+id);
  if(['SUCCEEDED','FAILED','PARTIAL','ROLLED_BACK','COMPENSATION_FAILED'].includes(j.state)){
   assert.equal(j.state,'SUCCEEDED',JSON.stringify(j));return;
  }
  await new Promise(r=>setTimeout(r,1000));
 }
 throw Error('job timed out');
}
async function edit(action){
 await page.goto(base+'/#/ips');
 await page.getByRole('heading',{name:'Snort IPS 配置',exact:true}).waitFor();
 await choose('资源 Agent',access.nodeId);
 await page.getByRole('button',{name:'新建资源候选',exact:true}).click();
 await choose('资源操作',action);
 const sid=page.getByRole('spinbutton',{name:'规则 SID',exact:true});
 await sid.fill('1000099');await sid.blur();
 if(action==='创建规则')await page.getByRole('textbox',{name:'Snort3 规则',exact:true}).fill('alert icmp any any -> any any (msg:"Web IPS acceptance"; sid:1000099; rev:1;)');
 const staged=page.waitForResponse(r=>r.url().includes('/resources')&&r.request().method()==='PUT');
 await page.getByRole('button',{name:'加入候选',exact:true}).click();
 const s=await staged;assert.ok(s.ok(),await s.text());
 await page.getByRole('button',{name:'预览全部变更',exact:true}).click();
 await page.getByRole('button',{name:'提交配置',exact:true}).click();
 const committed=page.waitForResponse(r=>r.url().endsWith('/commit')&&r.request().method()==='POST');
 await page.locator('.el-popconfirm:visible').getByRole('button',{name:'确定',exact:true}).click();
 const response=await committed,j=await response.json();assert.ok(response.ok(),JSON.stringify(j));
 await jobDone(j.id);
 report.checks.push(action+' through real Web/Gateway/Controller/Agent reload');
}
async function main(){
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN,args:['--no-sandbox']});
 page=await browser.newPage({viewport:{width:1700,height:1100}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base+'/#/login');
 await page.getByLabel('访问令牌',{exact:true}).fill(access.admin);
 await page.getByRole('button',{name:'连接控制台',exact:true}).click();
 await page.getByRole('heading',{name:'节点管理',exact:true}).waitFor();
 await edit('创建规则');
 let rows=(await api('/nodes/'+access.nodeId+'/query?kind=IPS_RULES')).records;
 assert.ok(rows.some(r=>r.sid===1000099&&r.loaded));
 await page.goto(base+'/#/ips');
 await choose('资源 Agent',access.nodeId);
 await choose('查询类型','实际生效规则');
 await page.getByRole('button',{name:'查询运行状态',exact:true}).click();
 await page.getByRole('cell',{name:'1000099',exact:true}).first().waitFor();
 await page.screenshot({path:path.join(out,'web-ips.png'),fullPage:true});
 await edit('删除规则');
 rows=(await api('/nodes/'+access.nodeId+'/query?kind=IPS_RULES')).records;
 assert.ok(!rows.some(r=>r.sid===1000099));
 assert.deepEqual(report.errors,[]);report.status='passed';
}
main().catch(async e=>{report.status='failed';report.errors.push(String(e.stack||e));process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'web-ips-failed.png'),fullPage:true}).catch(()=>{});}).finally(async()=>{
 if(browser)await browser.close();
 fs.writeFileSync(path.join(out,'web-ips.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
});
