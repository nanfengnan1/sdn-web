# 真实浏览器验收

本测试使用真实 HTTP/API，不拦截接口、不使用模拟业务数据。它会保存候选、执行无变化 Job；请在专用验收环境运行，不对正在手工使用的环境直接执行。

## 选择部署环境

| 环境 | 先决步骤 | 默认 Web 端口 | 对应凭据 |
| --- | --- | --- | --- |
| 新源码 Docker 环境 | 在相邻 Controller 完成 `python3 docker/manage.py up`，再运行 `python3 docker/test.py` 配置和验证网络 | 28080 | `sdn-controller/docker/state/tokens.json` |
| 旧 lab 环境 | 在相邻 Controller 运行 `python3 lab/run.py`，确认真实 EVPN 实验通过 | 18080 | `sdn-controller/lab/state/tokens.json` |

两套环境的节点身份和令牌不同，不能混用。浏览器访问 `http://<部署服务器IP>:<Web端口>`，占位符替换为实际值。

## 准备浏览器测试工具

需要 Node.js 22+、playwright-core 和可执行的 Chrome/Chromium。浏览器测试可以运行在另一台机器，但需能访问部署服务，并从受控的本地路径读取该环境的凭据文件。

下面在 Windows PowerShell 的 **sdn-web 源码目录** 执行，不要求固定用户名、盘符或共享目录：

```powershell
$testTools = Join-Path $env:LOCALAPPDATA 'sdn-web-e2e-tools'
npm install --prefix $testTools playwright-core
$env:PLAYWRIGHT_MODULE = Join-Path $testTools 'node_modules\playwright-core'
$env:CHROME_BIN = Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'

$controllerRoot = (Resolve-Path '..\sdn-controller').Path
$env:SDN_WEB_URL = 'http://<部署服务器IP>:28080'
$env:SDN_TEST_TOKENS = Join-Path $controllerRoot 'docker\state\tokens.json'
$env:SDN_TEST_ARTIFACTS = Join-Path $controllerRoot 'artifacts\browser-validation'
node .\tests\e2e\browser.cjs
```

先替换部署 IP，再运行。CHROME_BIN 应指向本机实际安装的浏览器。如果 Controller 源码或凭据不在相邻目录，直接将 SDN_TEST_TOKENS 和 SDN_TEST_ARTIFACTS 改成自己选择的绝对路径；不要为了测试把真实令牌放进源码仓库。旧 lab 环境使用 18080 和 lab/state/tokens.json。

Linux 可使用以下等价设置，在 sdn-web 源码目录执行：

```bash
npm install --prefix "$HOME/.local/share/sdn-web-e2e-tools" playwright-core
export PLAYWRIGHT_MODULE="$HOME/.local/share/sdn-web-e2e-tools/node_modules/playwright-core"
export CHROME_BIN='<本机Chrome或Chromium可执行文件绝对路径>'
export SDN_WEB_URL='http://<部署服务器IP>:28080'
export SDN_TEST_TOKENS="$(realpath ../sdn-controller/docker/state/tokens.json)"
export SDN_TEST_ARTIFACTS="$(realpath ../sdn-controller)/artifacts/browser-validation"
node tests/e2e/browser.cjs
```

脚本默认参数仍对应旧 lab，因此新部署务必显式设置 SDN_WEB_URL、SDN_TEST_TOKENS 和 SDN_TEST_ARTIFACTS。凭据文件只由测试进程读取，不在控制台打印；测试使用无头浏览器，不要求可见桌面。

## 检查结果

验证登录、真实节点与能力、期望配置、候选编辑/保存/预览、版本冲突后的恢复、提交和任务结果、重新登录后查询持久任务、G6/EVPN、viewer 前后端只读权限和错误状态。

结果写入 SDN_TEST_ARTIFACTS 指定目录，包括 browser-results.json、browser-console.json 和 ui-*.png；截图不包含明文令牌。测试可能创建持久候选和少量无变化 Job，不能称为完全只读。

空白环境只读页面检查使用 `tests/e2e/clean.cjs`，要求未纳管、revision 为 0、无业务任务的环境；它与正常已配置环境的 browser.cjs 目标不同。各脚本都应保留失败输出和重跑后的结果。
# 独立资源表单测试

`resources.cjs` 必须显式提供 `SDN_WEB_URL` 和 `SDN_TEST_TOKENS`，只针对可销毁的隔离实验。
它通过真实浏览器分三笔事务创建 `WEB-TEST` VRF（table 62001）、添加 `webbd` 和 IPv4 地址、
再创建 `webl3` / `webvx3` 并绑定 L3VNI 62001。随后检查关系树、查询来源、未知接口错误和 viewer。
脚本保留这些专用测试对象供排查，环境结束后统一清理；不要与修改同一节点的其他脚本并发。
报告为 `resource-browser-results.json`，截图不含令牌。

`resource-components.cjs` 则从 `ui/apps/web-ele/dist` 启动临时本机静态服务器，
以模拟 Controller HTTP 契约验证表单和浏览器行为；不连接真实 Agent、不证明 FRR/Linux 转发。
它使用相同的 `PLAYWRIGHT_MODULE` / `CHROME_BIN`，无需部署环境凭据，
报告为 `resource-component-results.json`。

组件浏览器回归还检查独立接口条目、路由下的 BGP/OSPF 分类、隧道下仅开放 VXLAN、
静态路由入口不展示，以及表单和查询范围、跨分类共享候选、VXLAN 请求字段和切换后的查询状态清理。

