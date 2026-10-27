测试与验收
==========

验证分为 Gateway 契约、前端辅助逻辑、静态构建和真实环境联调。单元测试中的可控客户端不等于真实 Linux/FRR 行为验证。

常规源码检查
------------

在项目根目录执行：

.. code-block:: bash

   make test
   make build

``make test`` 包含 Gateway ``go test -race ./...``、``go vet ./...``，以及 UI 的 ``pnpm test``、``pnpm typecheck``。``make build`` 生成 Gateway 二进制和生产 UI。首次运行先完成 ``pnpm install --frozen-lockfile``。

也可以按组件运行：

.. code-block:: bash

   cd gateway
   go test -race ./...
   go vet ./...
   cd ../ui
   pnpm test
   pnpm typecheck
   pnpm build

当前测试定位
------------

.. list-table:: 测试覆盖
   :header-rows: 1
   :widths: 45 55

   * - 文件 / 范围
     - 主要验证
   * - ``gateway/internal/httpapi/server_test.go``
     - 认证透传、viewer 禁写、路径/body 校验、Protobuf JSON、幂等键、上游错误、超时和并发限额
   * - 同文件的 SSE 用例
     - 游标、流错误、取消传播、慢连接和连接释放
   * - ``ui/apps/web-ele/src/sse.test.ts``
     - 跨 chunk 帧、UTF-8、重复事件和大整数序号
   * - ``ui/apps/web-ele/src/workflow.test.ts``
     - 请求 ID、明确拒绝与未知结果、异步刷新合并和销毁
   * - ``vue-tsc`` / Vite build
     - 类型契约、业务组件与生产资源构建
   * - ``tests/e2e/browser.cjs``
     - 真实登录、候选/计划/提交、任务、重登恢复、拓扑和 viewer 权限
   * - ``tests/e2e/clean.cjs``
     - 空白手测环境页面状态的只读检查

真实 Docker 网络与浏览器
--------------------------------

完整实验由相邻 Controller 项目 ``docker/manage.py`` 和 ``docker/test.py`` 管理。先在专用环境运行网络/API 测试，再运行浏览器工作流；不要对正在手工使用的环境直接启动这些会提交配置的用例。

在专用、空白的 ``sdn-docker`` 环境验证网络/API：

.. code-block:: bash

   cd ~/program/github/sdn-controller
   python3 docker/manage.py status
   python3 docker/test.py

``test.py`` 要求全新 revision 0、空任务的环境，随后实际配置 EVPN、验证协议和转发。它不是只读健康检查。

浏览器测试需要 Node、``playwright-core`` 和 Chrome/Chromium。以下 Windows 示例在
sdn-web 源码目录运行，安装专用测试工具并显式指定部署地址、凭据和报告目录；
先替换部署 IP，浏览器路径以本机安装为准：

.. code-block:: powershell

   $testTools = Join-Path $env:LOCALAPPDATA 'sdn-web-e2e-tools'
   npm install --prefix $testTools playwright-core
   $env:PLAYWRIGHT_MODULE = Join-Path $testTools 'node_modules\playwright-core'
   $env:CHROME_BIN = Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'
   $controllerRoot = (Resolve-Path '..\sdn-controller').Path
   $env:SDN_WEB_URL = 'http://<部署服务器IP>:28080'
   $env:SDN_TEST_TOKENS = Join-Path $controllerRoot 'docker\state\tokens.json'
   $env:SDN_TEST_ARTIFACTS = Join-Path $controllerRoot 'artifacts\browser-validation'
   node .\tests\e2e\browser.cjs

Controller 源码或凭据不在相邻目录时，改为自己可读的实际路径。浏览器测试机与部署主机不同时，
由管理员提供该环境的受控凭据文件，不能用其他环境的令牌代替。
脚本从文件读取凭据，不在终端打印 token；截图也不包含明文令牌。
测试包含实际候选和无变化 Job，不应宣称它完全不写业务状态。
旧 lab 实验默认参数使用 18080 与 lab/state；新 Docker 使用 28080 与 docker/state，
必须设置覆盖变量。Linux 示例与完整说明见 :download:`浏览器测试说明 <../../tests/e2e/README.md>`。

已归档结果与本次验证
--------------------

2026-10-25 的独立 Docker 验收归档记录了 17 项网络/API 和 10 项浏览器检查，以及清空后的只读检查。报告见 :download:`Docker 验收记录 <../docker-validation.md>`；原始结果在相邻 Controller 项目的 ``artifacts/docker/``。

这些是采用独立数据库容器的历史证据，不能代表当前内置数据库版本。
内置数据库版本的历史结果保留在相邻 Controller 项目 ``docs/bundled-validation.md``。
本轮独立资源的整网验证记录在该项目 ``docs/resource-validation.md``，记录实际协议、资源、CLI、浏览器与部署结果；
Web 的源码与组件检查另见 :download:`资源工作台验证记录 <../resource-validation.md>`。
HTML 严格构建和页面链接检查不替代网络或浏览器验收。
新业务修改需重新运行适当范围的测试，保存失败日志及修复后的结果，不覆盖失败历史。

贡献时补什么测试
----------------

本轮独立资源回归
^^^^^^^^^^^^^^^^

Gateway 新增资源路由测试覆盖路径/body 节点一致性、viewer 拒绝、optional false/0
透传、Import 幂等键、查询筛选和错误不变空表。UI 资源单测覆盖稀疏编辑、独立租户
和后续绑定、能力限制、双栈协议字段、空租户与未绑定对象关系树。

在上一节的隔离环境变量配置完成后，运行新增真实表单脚本：

.. code-block:: powershell

   node .\tests\e2e\resources.cjs

该脚本必须显式提供地址与凭据路径，创建专用 ``WEB-TEST`` 租户并分三笔事务追加
BD、地址和 L3VNI，然后检查关系树、真实查询错误和只读角色。
它会保留专用测试对象供排查，由隔离环境的生命周期脚本统一清理。
不要与另一个修改同节点资源的验收脚本并行运行。

新增脚本通过与否以 ``resource-browser-results.json`` 为准，不能由单元测试通过推断。

``resource-components.cjs`` 在临时的本机 HTTP 服务器运行生产 UI，使用明确标记的
Controller 契约模拟，覆盖 false/0 表单、VRF 身份保留、草稿版本、多节点切换、
查询错误、viewer 和浏览器脚本错误。它无需启动容器，但不证明 Linux/FRR 功能。
报告为 ``resource-component-results.json``；必须与真实实验的结果区分。

扩展验证要求
^^^^^^^^^^^^

* 新查询：权限、合法请求、参数错误、空结果、上游不可达、取消和范围边界。
* 新写操作：版本冲突、固定幂等键、同键异内容、回复丢失后恢复、明确拒绝与未知结果区分。
* 新订阅：分帧、UTF-8、重复/乱序/大整数游标、终态、慢连接、关闭清理。
* 新页面：加载、空、错误、只读与管理员路径，真实浏览器确认没有脚本错误和凭据持久化。

验证配置成功时还要区分协议收敛和业务转发。扩容上限、多 Gateway 副本、长时间压力及任意规模拓扑不在现有功能用例所证明的范围内。

VPP 真实查询
^^^^^^^^^^^^

query-presentation.test.ts 覆盖原生字段展示与状态格式。
tests/e2e/vpp-query.cjs 使用真实浏览器和三组件，不模拟 API：viewer 登录、
IPv6 多点 VXLAN、远端单播/BUM 展开、地址族及远端过滤、原生接口和脚本错误检查。

先准备 alpine/sdn-agent:vpp-dev、alpine/sdn-controller:vpp-dev、alpine/sdn-web:vpp-dev。
在同级 Agent 仓库启动 SDN_VPP_STACK=1 SDN_VPP_BROWSER=1 SDN_VPP_UNDERLAY=6
的 lab/vpp_evpn.py；看到 READY 后，设置 SDN_TEST_ACCESS 指向该实验生成的
artifacts/vpp/dual-ipv6/stack-access.json，再执行：

.. code-block:: bash

   node tests/e2e/vpp-query.cjs

需安装 playwright-core，或通过 PLAYWRIGHT_MODULE 指定已安装模块；CHROME_BIN
指定本机 Chrome。远程运行浏览器时保持该目录可写，并将 access 文件 url 改为可达的
实验 Web 地址。报告和截图写回目录，Agent 脚本随后继续撤销测试并清理临时资源。
临时 access 文件含测试令牌，不提交版本库；脚本结束会删除它。
