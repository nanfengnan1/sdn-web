分层、组件与请求时序
====================

进程与职责
----------

.. code-block:: text

   Browser
      |
   +---------------------------------------------------------+
   | Presentation: Vue 3 / Vben / Element Plus / G6           |
   | Nodes | Desired | Changes | Jobs | Topology              |
   +---------------------------------------------------------+
   | UI application: router / session / API / SSE reducer     |
   | candidate state / request keys / cancellation / cursors  |
   +---------------------------------------------------------+
      |
      | HTTPS JSON + fetch SSE
      v
   +---------------------------------------------------------+
   | Gateway HTTP: auth / origin / request ID / concurrency   |
   | query handlers / change handlers / JSON / error mapping  |
   | SSE framing / bounded buffer / write deadlines           |
   +---------------------------------------------------------+
   | Controller client: generated public North gRPC stub      |
   | TLS / credential forwarding / timeout / cancellation     |
   +---------------------------------------------------------+
      |
      | gRPC / TLS
      v
   Controller: North -> planner -> jobs -> Agents
                    \-> durable repository

Vue UI 是静态应用，由 Nginx 或 Gateway 可选静态目录提供。Go Gateway 是独立进程。Controller 不包含前端资产，也不导入 Web 代码；Gateway 只依赖 Controller 和 Agent 的公开 Protobuf 包。

默认 Docker ``web`` target 将 Nginx 与 Gateway 两个进程放在同一个容器，由 supervisor
共同管理；保留 ``ui`` 和 ``gateway`` targets 用于分离部署。这不改变 HTTP/gRPC 分层。

Gateway 不连接 Agent、不执行 Linux/FRR 命令、不访问 etcd，也不重新实现 VNI 规划、依赖 DAG 或回滚。浏览器提交资源 Configuration，不提交任意命令字符串。

当前 Docker 部署把 etcd 作为 Controller 容器内进程，把 Redis 和 FRR 作为每个 Agent
容器内进程。数据库仍使用独立持久卷；这种进程部署方式不改变上述 API 与数据归属边界。
Controller / Agent 各自通过只读挂载的 controller.conf / agent.conf 配置应用与内置数据库。
Web 的 config.js 只配置 HTTP API 地址；业务 Configuration 中的 nodeId 则引用节点注册 UUID。

实际代码映射
------------

.. list-table:: 组件入口
   :header-rows: 1
   :widths: 45 55

   * - 路径（相对项目根目录）
     - 职责
   * - ``ui/apps/web-ele/src/bootstrap.ts``、``layout.vue``、``router.ts``
     - Vben 初始化、布局、导航和路由
   * - ``ui/apps/web-ele/src/session.ts``
     - 内存令牌及角色
   * - ``ui/apps/web-ele/src/api.ts``、``types.ts``
     - HTTP 调用、错误、公共响应类型和 SSE 获取
   * - ``ui/apps/web-ele/src/sse.ts``、``workflow.ts``
     - SSE 分帧/序号处理、请求 ID、明确拒绝判断、刷新合并
   * - ``ui/apps/web-ele/src/views/``
     - 登录、节点、期望配置、候选、任务、拓扑页面
   * - ``ui/apps/web-ele/src/resources.ts``、``views/resource-workspace.vue``、``views/resource-query.vue``
     - 资源表单和关系树、候选资源编辑、运行查询与筛选
   * - ``gateway/cmd/sdn-web-gateway/main.go``
     - 参数、TLS、HTTP server 和关闭流程
   * - ``gateway/internal/httpapi/server.go``
     - 鉴权、限额、路由、协议转换、错误与 SSE
   * - ``gateway/internal/controllerclient/client.go``
     - 公共 North gRPC 连接
   * - ``docker/``
     - 默认 web 和可选 gateway/ui targets；Nginx 配置及联合进程 supervisor
   * - ``tests/e2e/``
     - 真实浏览器工作流及空环境检查

逻辑架构中的 auth、handler、event writer 当前集中在小型 ``httpapi`` 包；它们不是三个独立服务。Vben 的共享 packages 和构建 workspace 仍保留，修改布局时优先使用已有能力。

数据归属
--------

.. list-table:: 状态放在哪里
   :header-rows: 1
   :widths: 25 45 30

   * - 组件
     - 持有数据
     - 重启后的来源
   * - Browser
     - 页面数据、内存 token；标签页 sessionStorage 中的候选/提交请求标识
     - 重新认证并查询 Controller
   * - Gateway
     - gRPC 连接、请求上下文、有界订阅缓冲
     - 重建连接；无独立业务数据库
   * - Controller
     - Desired、Change、Plan、Job、幂等回执、节点基线
     - etcd/File 持久化存储
   * - Agent
     - 本地身份、Candidate、Running、Operational、事务日志与 Undo
     - Redis/File；实际 Linux 网络恢复另有边界

Gateway 具备并发上限和独立进程生命周期，但并不使 Controller 自动具备 HA。Controller 目前要求单写入者；Gateway 多副本规模和故障切换仍需单独验证。

Gateway 不保存 HTTP 业务响应缓存。普通 API 与 readyz 返回 Cache-Control: no-store，
SSE 改用 no-cache, no-transform；默认 Docker Nginx 对 config.js 设置 no-store，
其他静态资产没有统一的 no-store 策略。HTTP 缓存头、Controller 拓扑缓存和持久幂等回执
是三种不同机制，不能互相替代。

重启 Web 会中断连接，浏览器重新认证后从 Controller 查询原候选与 Job。
sessionStorage 仅是当前标签页的恢复线索，不是服务端数据库备份；关闭标签页或清除站点数据
可能丢失这些本地标识，但不会删除 Controller 已保存的任务。

查询时序
--------

.. code-block:: text

   Browser               Gateway                 Controller
      | GET /nodes+Bearer    |                         |
      |-------------------->|                         |
      |                     | origin/auth/limit       |
      |                     | ListNodes + same token  |
      |                     |------------------------>|
      |                     |                  auth + query
      |                     |<------------------------|
      |<-- 200 protojson ---|                         |

Controller 再次鉴权。查询结果、空状态和错误分别展示，不用本地模拟业务数据掩盖后端故障。HTTP 请求结束会释放并发配额和查询上下文。

编辑、计划和提交时序
--------------------

.. code-block:: text

   Browser                 Gateway             Controller            Store
      | GET desired             |                  |                   |
      |------------------------>|----------------->|                   |
      |<-- base revision -------|<-----------------|                   |
      | Begin(base,key) -------->| BeginChange ---->| save candidate -->|
      |<-- change_id -----------|<-----------------|<------------------|
      | Edit(full config,rev) -->| EditChange ----->| save draft ------>|
      |<-- edit revision -------|<-----------------|                   |
      | Plan ------------------>| PlanChange ----->| validate/compile  |
      |<-- immutable plan ------|<-----------------|                   |
      | explicit user confirm   |                  |                   |
      | Commit(plan,key=K) ----->| CommitChange(K)->| recheck versions  |
      |                         |                  | persist desired,  |
      |                         |                  | job + receipt --->|
      |<-- 202 Job J -----------|<-----------------|<------------------|
      |                         |                  | worker -> Agents  |
      | GetJob/WatchJob -------->|----------------->|                   |
      |<-- snapshot/events -----|<-----------------|                   |

Commit 持久受理后任务执行不依赖浏览器上下文。HTTP ``202`` 不表示所有节点配置成功，更不表示流量已验证。跨节点失败策略及是否能继续提交由 Controller 决定。

提交回复丢失时序
----------------

.. code-block:: text

   Browser                  Gateway               Controller
      | Commit(change=C,key=K) |                       |
      |----------------------->|---------------------->|
      |                        |             persist Job J + receipt K
      |                 response lost                 |
      | keep C / plan / K      |                       |
      | retry same request --->|---------------------->|
      |<-- original Job J -----|<-- receipt lookup -----|
      | query J                |                       |

未知结果时不能生成新键重放。明确拒绝时，前端也先 GetChange：候选已有 jobId 就恢复任务，确认未冻结后才解除本地提交等待。

SSE 订阅恢复时序
--------------------

.. code-block:: text

   Browser                 Gateway               Controller
      | GET events after=N    |                       |
      |---------------------->| WatchJob(after=N) ---->|
      |<-- event N+1 ---------|<-- event N+1 ----------|
      | apply/dedupe/cursor   |                       |
      |         connection lost                      |
      | GET Job ------------->|---------------------->|
      |<-- snapshot+sequence -|<----------------------|
      | GET events after=S -->| WatchJob(after=S) ---->|
      |<-- missed/live -------|<----------------------|
      | terminal => stop      |                       |

Gateway 每个流只有一个事件缓冲槽，并设置写入超时。慢客户端不会造成无界积压；取消会传播给上游流。浏览器处理分片 UTF-8 和 SSE 帧，使用字符串/BigInt 比较序号。

拓扑边界
--------

Controller 提供关系图、EVPN 路由和观测新鲜度；前端用 G6 渲染，并保留关系来源。
GetTopology 的 refresh=false 读取 Controller 内存观测缓存，refresh=true 显式采集。
独立资源 QueryNode 则转发 Agent 查询，不读取这份拓扑缓存；Desired/候选资源又属于另一类管理数据。

Type-2/Type-3 不能独自证明物理 Leaf-Spine 接线。当前尚无 LLDP 采集、任意规模拓扑容量保证、历史流量指标或 ARP/ND 保活。前端不生成虚构主机和统计值。
