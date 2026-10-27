/* Real Web -> Gateway -> Controller -> VPP query acceptance. No mocked API.
 * Start sdn-agent/lab/vpp_evpn.py with SDN_VPP_STACK=1 SDN_VPP_BROWSER=1.
 * The Huawei VF lab also supports SDN_VPP_BROWSER=1 with
 * lab/vpp_sriov.py --offload --stack --vtep-family 6.
 * SDN_TEST_ACCESS must point at that disposable lab's stack-access.json.
 */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
assert.ok(process.env.SDN_TEST_ACCESS, 'Explicit disposable lab access file required');
const access = JSON.parse(fs.readFileSync(process.env.SDN_TEST_ACCESS, 'utf8'));
const out = path.dirname(process.env.SDN_TEST_ACCESS);
assert.match(access.stamp, /^sdn-(?:vpp-it|vf-lab)-/);
const report = { status: 'running', checks: [], errors: [] };
let browser, page;
const pause = () => new Promise(r => setTimeout(r, 200));
async function choose(label, value) {
  const combo = page.getByRole('combobox', { name: label, exact: true });
  await combo.focus(); await combo.press('ArrowDown');
  await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({ hasText: value }).first().click();
}
async function query() {
  const response = page.waitForResponse(r => r.url().includes('/query?') && r.request().method() === 'GET');
  await page.getByRole('button', { name: '查询运行状态', exact: true }).click();
  const r = await response; const v = await r.json(); assert.ok(r.ok(), JSON.stringify(v));
  assert.equal(v.source, 'vpp'); await pause(); return v;
}
async function login(token) {
  await page.goto(access.url + '/#/login');
  await page.getByLabel('访问令牌', { exact: true }).fill(token);
  await page.getByRole('button', { name: '连接控制台', exact: true }).click();
  await page.getByRole('heading', { name: '节点管理', exact: true }).waitFor();
  await page.evaluate(() => { location.hash = '/desired'; });
  await page.getByRole('heading', { name: 'Agent 资源工作台', exact: true }).waitFor();
  await choose('资源 Agent', access.nodeId);
}
async function main() {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  page = await browser.newPage({ viewport: { width: 1700, height: 1200 } });
  page.on('pageerror', e => report.errors.push(e.message));
  await login(access.viewer);
  assert.equal(await page.getByRole('button', { name: '新建资源候选', exact: true }).count(), 0);
  await page.getByRole('tab', { name: '隧道', exact: true }).click();
  await page.getByRole('tab', { name: 'VXLAN', exact: true }).click();
  await page.getByText('VPP 数据面', { exact: true }).waitFor();
  await choose('查询地址族', 'IPV6');
  const result = await query();
  assert.ok(result.records.length > 0);
  assert.ok(result.records.every(r => r.multipoint && r.family === 'IPV6' && r.local.includes(':')));
  report.checks.push('viewer reads native IPv6 multipoint VXLAN through all three services');
  const panel = page.locator('.panel').filter({ has: page.getByRole('heading', { name: '运行状态查询', exact: false }) }).last();
  const mappedIndex = result.records.findIndex(r => r.remotes.some(x => x.bum) && r.remotes.some(x => !x.bum));
  assert.ok(mappedIndex >= 0, 'need a VNI with both learned unicast and BUM destinations');
  await panel.locator('.el-table__expand-icon').nth(mappedIndex).click();
  await panel.getByRole('heading', { name: '远端封装映射', exact: true }).waitFor();
  await panel.getByText('BUM 复制', { exact: true }).first().waitFor();
  await panel.getByText('单播封装', { exact: true }).first().waitFor();
  await page.screenshot({ path: path.join(out, 'web-vpp-ipv6.png'), fullPage: true });
  report.checks.push('UI expands real unicast and BUM destinations with native interface identity');
  await choose('查询地址族', 'IPV4');
  assert.equal((await query()).records.length, 0);
  await page.getByText('查询成功，没有匹配的运行状态记录', { exact: true }).waitFor();
  report.checks.push('address-family filter does not leak IPv6 records into IPv4 results');
  await choose('查询地址族', 'IPV6');
  const remote = result.records[mappedIndex].remotes[0].remote;
  await page.getByLabel('查询邻居', { exact: true }).fill(remote);
  const filtered = await query();
  assert.ok(filtered.records.length > 0);
  assert.ok(filtered.records.every(r => r.remotes.some(x => x.remote === remote)));
  report.checks.push('remote VTEP filter returns matching native mappings');
  await page.getByRole('tab', { name: '接口', exact: true }).click();
  const interfaces = await query();
  assert.ok(interfaces.records.some(r => r.kind === 'vxlan' && r.vppName));
  report.checks.push('interface query includes native VXLAN alongside LCP interfaces');
  await page.getByLabel('查询接口', { exact: true }).fill('not-a-vpp-interface');
  const rejected = page.waitForResponse(r => r.url().includes('/query?'));
  await page.getByRole('button', { name: '查询运行状态', exact: true }).click();
  assert.ok(!(await rejected).ok());
  await page.locator('.el-alert--error').filter({ hasText: 'unknown VPP interface' }).waitFor();
  assert.equal(await page.getByText('查询成功，没有匹配的运行状态记录', { exact: true }).count(), 0);
  report.checks.push('unknown interface is a visible query error, not empty success');
  assert.deepEqual(report.errors, []); report.status = 'passed';
}
main().catch(async e => {
  report.status = 'failed'; report.error = e.stack;
  if (page) await page.screenshot({ path: path.join(out, 'web-vpp-failure.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
}).finally(async () => {
  fs.writeFileSync(path.join(out, access.stamp + '-browser.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2)); await browser?.close();
});
