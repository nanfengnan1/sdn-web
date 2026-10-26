扩展页面、资源表单与 API
========================================

本页把一项 Web 功能从公共协议、HTTP 映射、前端交互到验证串起来。
先阅读 :doc:`architecture` 理解状态归属，再按 :doc:`development` 启动开发环境。
权威业务语义来自 Controller/Agent 的公开 Protobuf 和实现，Web 负责交互与传输适配。

.. contents:: 扩展步骤
   :local:
   :depth: 2

先确定变化属于哪个项目
----------------------------------------

.. list-table:: 需求与修改范围
   :header-rows: 1
   :widths: 28 42 30

   * - 需求
     - 主要改动
     - Web 必须确认
   * - 给现有查询增加展示页面
     - 前端类型、API 调用、页面和路由；必要时添加 Gateway 映射
     - North RPC 已存在且已授权，数据来源和空/错误语义清楚
   * - 给现有 Operation 增加表单
     - resources.ts、resource-workspace.vue、字段和组件测试
     - Agent 支持操作及回滚，Controller 资源模型/规划已支持
   * - 新增运行状态查询种类或筛选
     - Agent Query、Controller QueryNode、Gateway 参数解析、UI 查询控件
     - 能力声明、筛选/分页/来源/时间和错误保持一致
   * - 新增网络资源或协议行为
     - 先扩展 Agent 协议/适配器和 Controller 编译/持久化，再接 Web
     - 不由 UI 按钮或 Gateway shell 命令绕过事务
   * - 扩展认证角色
     - Controller 授权与 Gateway 复核、前端角色体验
     - 不能只隐藏按钮；现有 admin/viewer 不等于租户级 RBAC

Agent 的 Driver 扩展流程在相邻 ``sdn-agent/docs/developer/adapters.rst``，
Controller 的公共协议与规划流程在相邻 ``sdn-controller/docs/developer/``。
这两个源码位置用于跨项目开发定位，不是本站 HTML 构建依赖。

实现入口
----------------------------------------

以下路径均相对 sdn-web 根目录：

.. list-table:: 源码与责任
   :header-rows: 1
   :widths: 52 48

   * - 路径 / 符号
     - 修改内容
   * - gateway/internal/httpapi/server.go：ServeHTTP
     - Origin、凭据与 viewer 禁写、并发配额、超时/取消、上游凭据透传
   * - 同文件：dispatch、read、matchID、key、queryRequest
     - 路径到 North RPC；严格 JSON、路径/body 一致性、幂等键和查询筛选
   * - 同文件：events、err
     - SSE 分帧与流错误、普通 gRPC 错误到 HTTP 的映射
   * - gateway/internal/controllerclient/client.go
     - 连接公开 North API；没有网络资源业务逻辑
   * - ui/apps/web-ele/src/types.ts、api.ts
     - 公共响应类型、统一 request、APIError、watchJob 和任务终态
   * - ui/apps/web-ele/src/resources.ts
     - ResourceAction/ResourceField、resourceActions、buildOperation、supports、resourceTree、queryKinds
   * - ui/apps/web-ele/src/views/resource-workspace.vue
     - 单节点资源候选、稀疏编辑、导入基线、预览、提交和恢复
   * - ui/apps/web-ele/src/views/resource-query.vue
     - 运行查询条件、分页、数据来源和错误展示
   * - ui/apps/web-ele/src/views/changes.vue、jobs.vue
     - 完整配置候选与未知提交恢复；任务快照/事件订阅
   * - ui/apps/web-ele/src/router.ts、layout.vue
     - 路由和菜单；现有资源工作台由 desired.vue 组合进入
   * - ui/apps/web-ele/src/session.ts、workflow.ts、sse.ts
     - 内存认证、请求键/刷新协调、SSE 解析与大整数序号
   * - ``gateway/internal/httpapi/server_test.go``、``ui/apps/web-ele/src/*.test.ts``
     - HTTP/上游契约与前端纯逻辑回归
   * - tests/e2e/resource-components.cjs、resources.cjs
     - 浏览器契约模拟与专用真实环境资源表单验收，二者证据不同

增加只读查询
----------------------------------------

1. 定义结果的权威来源和语义：Desired、候选资源、Controller 拓扑观测，还是
   Agent 即时 Query。返回空记录与上游出错是不同结果，不能统一吞成空表。
2. 先确认 Controller North API 可表达需求；若新增协议字段，保留既有字段编号，
   在所属仓库更新公开生成代码和测试。Gateway 只使用公开 API 包，不导入其 internal。
3. 在 ``dispatch`` 增加明确的 GET 路径，使用请求自身的 Context 调用 North。
   保留 ServeHTTP 已建立的 Authorization、deadline、取消和并发限制。
   新查询参数要像 ``queryRequest`` 一样检查未知/重复参数、枚举、数字和范围。
4. 前端在 types.ts 表达响应，在页面通过 api.ts 的 ``request`` 调用。
   revision/sequence 保持十进制字符串，不转成可能丢精度的 Number。
   nodeId 使用节点注册 UUID，路径段使用 encodeURIComponent。
5. 页面区分 loading、空、错误和 stale；展示来源及采集时间。
   切换节点/筛选条件后取消旧请求或校验请求代次，避免旧结果覆盖新选项。
   查询条件变化时丢弃旧分页游标，不将其用于另一节点或另一种查询。
6. 新独立页面注册 router.ts 和菜单；嵌入工作台的查询则沿用当前容器组件。
   添加只读角色、参数错误、上游失败、取消与分页用例，更新 :doc:`http-api` 和用户页。

当前 ``GET /nodes/{id}/query`` 经 Controller 检查节点状态/能力后转发 Agent；
Controller 不缓存这条接口的 QueryResponse。
``GET /nodes/{id}/resources`` 读取 Desired 或候选资源，不能用它替代实际运行状态查询。
``GET /topology?refresh=false`` 则读取 Controller 内存中的拓扑观测缓存，
需要新观测时显式 refresh=true。三者不能合并成统一的“自动实时状态”。

增加资源表单或字段
----------------------------------------

1. 对照 Agent Operation oneof 和 Controller 资源编辑入口确认 code、action、数据字段名、
   对象身份及依赖。默认已有 generic EditNodeResources HTTP 路由，
   给现有操作增添表单通常无需新增一条写接口。
2. 在 resources.ts 增加 ResourceAction，并使用已有字符串、数值、布尔、列表、选择项
   和资源引用字段定义。根据需求调整 resourceSection、objectName 和 resourceTree，
   保留独立租户、未绑定 BD/VXLAN 等合法中间状态。
3. 区分“未提供字段”和显式 false/0。buildOperation 只跳过空字符串/undefined；
   布尔开关未编辑时不能自动写成 false，稀疏 SET 不能填入所有 CREATE 默认值。
4. 更新行编辑/删除所需身份字段，尤其是 VRF、ASN、地址族、接口或前缀。
   当前行回填逻辑在 resource-workspace.vue 的 selectRow；新增身份字段时同步检查，
   避免选择同名对象后修改了其他 VRF 中的资源。
5. 沿用 ``supports`` 的节点能力检查和 admin 限制；服务器仍重新验证。
   BD 级 bridgePolicies 使用专门字段，不能擅自改成 Agent 的任意 Operation。
6. 所有写入进入候选，返回新 editRevision 后清除旧计划，再预览和提交。
   资源界面和完整 JSON 界面共享候选/提交恢复信息，改动时同时检查两个入口。

例如可选字段的三种状态必须分别保留：

.. code-block:: json

   {"editRevision":"3","operations":[{
     "code":"BD","action":"SET","bridge":{"name":"br10","stp":false,"ageingTime":0}
   }]}

这里 stp=false 和 ageingTime=0 都是明确设置；未出现的 mtu 不表示清零。
示例只展示候选请求形状，editRevision 和资源身份必须取自当前真实候选。
完成候选编辑并不代表 Linux/FRR 已改变，最终进度通过 Job/SSE 展示。

增加独立写接口与恢复流程
----------------------------------------

若现有候选资源流程不能表达功能，先在 Controller 定义版本前提、持久受理点和幂等语义，
再增加 HTTP 映射。GET 不得承担写副作用；当前 ServeHTTP 允许 viewer 读取，但拒绝写方法。
不能新增一个 GET 路径绕过授权。

Begin、Commit、Import 使用固定 Idempotency-Key/requestId；key 函数拒绝 Header/body 冲突。
HTTP X-Request-ID 是一次调用的诊断标识，不能代替持久业务请求键。
发送前保存必要的非敏感恢复字段，遇到超时或 5xx 保留原键；
Commit 未知结果时先查询候选/Job 或重试原请求，不能生成新键重复提交。
EditNodeResources 使用 editRevision 控制并发，其超时恢复应先重新读取候选，
不能凭请求失败就认定编辑没有保存。

任务长期执行归 Controller。页面卸载、Gateway 重启或 SSE 断开不会取消已持久受理的 Job。
新任务状态应同步 api.ts 的 terminal 判断、事件解析与恢复测试，未知状态不能显示成成功。
若增加 RetryRollback 页面，还需补 HTTP 路由、admin 权限、确认步骤与请求恢复；
当前 Controller 有该 RPC/CLI，但 Web 尚未实现此入口。

验证与文档完成条件
----------------------------------------

在已安装依赖的项目根目录执行 ``make test``、``make build`` 和 ``make -C docs html``。
检查范围由变化决定，详细命令与真实环境前提见 :doc:`testing`。

* Gateway：合法和非法请求、viewer 禁写、路径/body 冲突、optional false/0、
  原凭据透传、上游错误、Context 取消、超时和资源限制。
* 表单：必填/边界/未设置字段、资源身份、稀疏更新、依赖引用、独立资源关系树，
  节点切换后不套用旧响应。
* 写工作流：并发 editRevision、固定请求键、同键不同内容、响应丢失、明确拒绝和未知结果，
  登录恢复后仍可定位原候选与 Job。
* SSE：分帧、UTF-8、重复/大整数序号、断线重查、终态退出、页面卸载与慢连接。
* 浏览器：加载/空/错误状态、admin/viewer、真实按钮与输入控件；
  契约模拟只证明 UI 交互，不证明网络收敛或业务转发。

更新 HTTP 契约、用户资源页、架构中的状态归属和新增源码入口。
若涉及依赖、镜像或启动参数，同步 :doc:`/user/source-install`、:doc:`/user/docker-deploy`
和 :doc:`/user/release`。提交范围包含修改的源码、测试和文档源；
生成 dist/HTML、node_modules、令牌和实验运行状态不作为代码提交。
