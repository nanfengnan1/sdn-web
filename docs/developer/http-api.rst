HTTP、Protobuf 与 SSE 契约
============================================

Gateway 使用手写薄适配层调用 ``sdn.controller.v1.North``。权威资源 schema 位于相邻 Controller 项目的 ``api/controller/v1/controller.proto``，本项目实际映射位于 ``gateway/internal/httpapi/server.go``。

请求公共规则
------------

所有 ``/api/v1`` 请求使用 ``Authorization: Bearer <token>``。普通写请求需要管理员。身份凭据仅放 Header，不进入 URL。Controller 对转发 RPC 再次鉴权。

JSON 遵循 Protobuf JSON：字段名 lowerCamelCase，``uint64`` revision/sequence 使用十进制字符串。解析拒绝未知字段和路径 ID 与请求体 ID 不一致的情况。需要 JSON body 的接口要求 ``Content-Type: application/json``，body 上限为 1 MiB。

列表默认每页 50 条，``pageSize`` 为 1..200，``pageToken`` 为不透明游标；继续读取返回的 ``nextPageToken``。

接口一览
--------

以下路径省略公共前缀 ``/api/v1``。``{id}`` 为 URL path segment。

.. list-table:: 已实现接口
   :header-rows: 1
   :widths: 33 29 38

   * - 方法 / 路径
     - 请求
     - 结果 / Controller RPC
   * - ``GET /me``
     - 无
     - Gateway 角色 ``admin`` / ``viewer``
   * - ``GET /nodes``
     - pageSize、pageToken
     - Nodes / ListNodes
   * - ``GET /nodes/{id}``
     - 无
     - Node / GetNode
   * - ``POST /nodes/{id}/adopt``
     - expectedRevision、allowExisting
     - Node / AdoptNode
   * - ``GET /desired``
     - 无
     - ConfigurationState / GetConfiguration
   * - ``POST /changes``
     - baseRevision；Idempotency-Key
     - ``201`` Change / BeginChange
   * - ``GET /changes/{id}``
     - 无
     - Change / GetChange
   * - ``PUT /changes/{id}``
     - editRevision、完整 configuration
     - Change / EditChange
   * - ``POST /changes/{id}/plan``
     - 无
     - Plan / PlanChange
   * - ``POST /changes/{id}/commit``
     - planId；Idempotency-Key
     - ``202`` Job / CommitChange
   * - ``DELETE /changes/{id}``
     - 无
     - 空 Protobuf JSON / AbortChange
   * - ``GET /jobs``
     - pageSize、pageToken
     - Jobs / ListJobs
   * - ``GET /jobs/{id}``
     - 无
     - Job / GetJob
   * - ``GET /jobs/{id}/events``
     - afterSequence 或 Last-Event-ID
     - SSE / WatchJob
   * - ``GET /topology``
     - refresh；可重复 nodeId
     - Topology / GetTopology

Controller 的 ``RetryRollback`` 已有 gRPC/CLI 接口，当前 Gateway 没有对应 HTTP 路由。不要根据 Controller proto 自动假定所有 RPC 都已对 Web 暴露。

独立资源与运行查询
------------------

.. list-table:: 资源接口
   :header-rows: 1
   :widths: 45 55

   * - 路径
     - 契约
   * - ``GET /nodes/{id}/resources?changeId=...``
     - GetNodeResources；不传 changeId 读取 Desired，传入则读取候选。返回 resources、desiredRevision、editRevision、agentRevision、adopted、state、mode。
   * - ``PUT /changes/{change}/nodes/{node}/resources``
     - EditNodeResources；body 含 editRevision、operations 和/或 bridgePolicies。稀疏修改，false/0 的 optional presence 保留。
   * - ``POST /nodes/{id}/resources/import``
     - ImportNodeResources；expectedAgentRevision 与 Idempotency-Key。读回验证后建立基线，不下发网络配置。
   * - ``GET /nodes/{id}/query``
     - QueryNode；直通 Agent QueryRequest 的受控筛选参数，返回真实运行记录及其来源、时间和状态。

每个资源操作沿用 ``sdn.agent.v1.Operation`` 的强类型 oneof。
Controller 生成自然键对象 ID、补齐删除参数、排序依赖并记录 Desired；Gateway 不生成 vtysh 或 Linux 命令。
资源修改只保存候选；后续仍需 PlanChange 和 CommitChange，最终状态通过 Job/SSE 获取。

BD 策略示例（加入已有候选，不立即执行）：

.. code-block:: json

   {
     "editRevision": "3",
     "bridgePolicies": [{"bridge": "br10", "neighSuppress": false}]
   }

Query 必须提供 ``kind`` 枚举名，例如 ``FDB``、``EVPN_ROUTES``、``OSPF_NEIGHBORS``。
可选参数为 ``vrf``、``bridge``、``interface``、``family``、``ospfVersion``、``pageSize``、
``pageToken``、``routeType``、``prefix``、``neighbor``。family 为 ``IPV4``、``IPV6``、
``L2VPN_EVPN`` 或 ``AF_UNSPECIFIED``；ospfVersion 为 2/3；pageSize 为 1..200。
未知或重复参数、无效枚举和数字在 Gateway 拒绝；筛选组合与能力在 Controller/Agent 再验证。
QueryResponse 包含 ``records``（Struct 数组）、``source``、``collectedUnixMs``、
``revision``、``stale``、``error``、``totalCount``、``nextPageToken``。
RPC 错误使用正常 HTTP 错误映射，不转换成空 records。

QueryNode 每次经 Controller 检查节点状态与能力后调用 Agent，Controller 不保存该接口
的结果缓存。GetNodeResources 是期望/候选资源读取；GetTopology 的 refresh=false
才使用 Controller 的拓扑观测缓存。HTTP 缓存策略不能用来判断底层数据是否重新采集。

写请求示例
----------

Begin 请求形状：

.. code-block:: http

   POST /api/v1/changes HTTP/1.1
   Authorization: Bearer <admin-token>
   Content-Type: application/json
   Idempotency-Key: <fixed-begin-request-id>

   {"baseRevision":"0"}

Edit 请求的 ``configuration`` 是完整资源对象：

.. code-block:: json

   {
     "editRevision": "0",
     "configuration": {
       "nodes": [],
       "tenants": [],
       "networks": []
     }
   }

示例中的空数组只说明传输结构；实际操作必须使用 GetConfiguration/GetChange 返回的最新完整配置与实际 editRevision。

Commit 使用计划的 ``planId``，成功返回完整公开 ``Job``，任务 ID 在 ``id`` 字段中：

.. code-block:: http

   POST /api/v1/changes/<change-id>/commit HTTP/1.1
   Authorization: Bearer <admin-token>
   Content-Type: application/json
   Idempotency-Key: <fixed-commit-request-id>

   {"planId":"<plan-id>"}

Begin/Commit 的幂等键为 1..128 字节。首选 ``Idempotency-Key``；实现兼容 body 中的 ``requestId``，两者同时存在时必须一致。同键不同内容被拒绝。HTTP ``X-Request-ID`` 是 Gateway 的单次诊断标识，不是业务幂等键。

错误映射
--------

错误 JSON 为 ``{"code":"...","message":"...","requestId":"..."}``。响应 Header 中也包含 ``X-Request-ID``。Internal/Unknown 的普通错误响应隐藏内部细节。

.. list-table:: gRPC 到 HTTP
   :header-rows: 1
   :widths: 25 75

   * - HTTP
     - gRPC / 含义
   * - 400
     - InvalidArgument：字段、body 或请求参数错误
   * - 401 / 403
     - Unauthenticated / PermissionDenied
   * - 404
     - NotFound：资源或 API 路径不存在
   * - 409
     - AlreadyExists / Aborted / FailedPrecondition：版本、冻结状态或前提冲突
   * - 410
     - OutOfRange：事件游标等参数超出范围
   * - 429
     - ResourceExhausted：并发或体积上限
   * - 499
     - Canceled：调用被取消
   * - 501
     - Unimplemented
   * - 503 / 504
     - Unavailable / DeadlineExceeded
   * - 500
     - 其他错误

``workflow.ts`` 将部分明确 4xx 归为拒绝，Commit 后仍需 GetChange 确认冻结/任务关系。5xx 和传输错误保持未知结果，保留原键查询或重试。不能把一次 HTTP 超时等价为配置回滚完成。

SSE 契约
------------

使用带 Authorization 的 ``fetch`` 流读取事件，不使用无法直接设置该 Header 的原生 EventSource 调用方式。游标优先取 ``afterSequence``，缺省再取 ``Last-Event-ID``；大于当前 Job sequence 会返回 410。

.. code-block:: text

   : connected

   id: 12
   event: job
   data: {"jobId":"<job-id>","sequence":"12","state":"APPLYING"}

   : heartbeat

示例省略了其他 JobEvent 字段。事件以空行结束，不能把一个网络 chunk 当成一条完整事件。处理 CRLF、拆分 UTF-8、多行 data 和重复序号；序号使用 BigInt/十进制字符串，不能经过 Number 导致精度损失。

服务器每 15 秒发送注释心跳，每次写操作有 10 秒 deadline，每条流缓冲一个事件。浏览器/代理断开会取消上游 WatchJob。响应开始后的上游错误以 ``event: stream-error`` 发送，然后关闭；客户端重新 GetJob 获取完整快照和游标，再决定是否订阅。

当前 UI 合并 250ms 内的任务详情刷新，最多一个合并刷新在途。未知结果继续订阅/查询，终态停止重连。页面最多展示最近 500 条事件，不提供无限历史保留承诺。

并发、跨域与健康
----------------

普通请求和 SSE 默认分别限制为 64，超出时立即返回 429。普通 RPC 默认 30 秒超时；SSE 不套同一个 unary deadline。退出时停止接收并有界关闭当前请求。

同源检查使用实际 HTTP/TLS scheme 与 Host；跨域来源需 ``-allowed-origins`` 精确列举，拒绝 ``*``。预检允许 Authorization、Content-Type、Idempotency-Key 和 Last-Event-ID。当前不使用 Cookie 凭据。

``GET /healthz`` 是未认证 liveness。``GET /readyz`` 需用户令牌并通过 GetConfiguration 检查 Controller 读访问。部署和代理示例见 :doc:`/user/deployment`。

普通 API/readyz 响应设置 ``Cache-Control: no-store``，SSE 设置
``Cache-Control: no-cache, no-transform``。Gateway 没有业务结果缓存或独立数据库，
Begin/Commit 的重复请求由 Controller 的持久回执恢复原 Change/Job，而非缓存 HTTP 响应。
新增路由、资源表单或查询的开发步骤见 :doc:`extensions`。
